/**
 * Audio Engine - Web Audio API処理
 * 低レイテンシーのオーディオ処理エンジン
 */

class AudioEngine {
    constructor(options = {}) {
        this.audioContext = null;
        this.source = null;
        this.analyser = null;
        this.scriptProcessor = null; // フォールバック用
        this.workletNode = null; // AudioWorklet用
        this.useWorklet = true; // AudioWorklet使用フラグ
        this.stream = null;
        this.onAudioData = null;
        this.gainNode = null; // ミュート用ゲインノード
        
        // バッファサイズ（大きいほど処理負荷が低い）
        this.bufferSize = 4096;
        
        // FFTサイズ（デフォルト4096、外部から設定可能）
        this.fftSize = options.fftSize || 4096;
        
        // チャンネル分離用
        this.splitter = null;
        
        // ファイル再生用
        this.audioBuffer = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.fileMode = 'realtime'; // 'realtime' or 'offline'
        this.onPlaybackUpdate = null;
        this.onPlaybackEnded = null; // 再生終了時のコールバック
        this.onOfflineComplete = null;
        this.enableAudioOutput = false; // 音声出力を有効にするか（ファイル再生時のみ）
    }

    async start(inputType, fileData = null, fileMode = 'realtime') {
        // AudioContextの作成
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive', // 低レイテンシー設定
            sampleRate: 48000 // 48kHz
        });

        try {
            // 入力ソースの取得
            if (inputType === 'microphone') {
                await this.startMicrophoneInput();
            } else if (inputType === 'desktop') {
                await this.startDesktopAudioInput();
            } else if (inputType === 'file') {
                this.fileMode = fileMode;
                if (fileMode === 'offline') {
                    await this.startOfflineAnalysis(fileData);
                    return; // オフライン解析は別処理
                } else {
                    await this.startFileInput(fileData);
                }
            }

            // 解析ノードの作成
            await this.setupAudioNodes();

            console.log('Audio engine started');
            console.log('Audio processing:', this.useWorklet ? 'AudioWorklet' : 'ScriptProcessor (fallback)');
            console.log('Sample rate:', this.audioContext.sampleRate);
            console.log('Buffer size:', this.bufferSize);
            console.log('FFT size:', this.fftSize);
        } catch (error) {
            throw new Error('Audio input initialization failed: ' + error.message);
        }
    }

    async startFileInput(fileData) {
        // 音声ファイルをデコード
        this.audioBuffer = await this.audioContext.decodeAudioData(fileData);
        console.log('Audio file loaded:', this.audioBuffer.duration, 'seconds');
        
        // リアルタイムモードの場合は音声出力を有効化
        this.enableAudioOutput = (this.fileMode === 'realtime');
        console.log('Audio output enabled:', this.enableAudioOutput);
        
        // 初期状態は一時停止（再生はplayFile()で開始）
        this.isPlaying = false;
        this.isPaused = true;
        this.pauseTime = 0;
        
        // source は playFile() で作成されるので、ここでは null のまま
        this.source = null;
    }

    async startOfflineAnalysis(fileData) {
        // オフラインで音声ファイル全体を高速解析
        console.log('Starting offline analysis...');
        
        // 通常のAudioContextでデコード
        const audioBuffer = await this.audioContext.decodeAudioData(fileData);
        
        // オフラインコンテキストを作成
        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );
        
        // ソースを作成
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // ScriptProcessorの代わりにオフライン処理
        const analyser = offlineContext.createAnalyser();
        analyser.fftSize = this.fftSize;
        
        source.connect(analyser);
        source.connect(offlineContext.destination);
        source.start(0);
        
        // オフラインレンダリング開始
        const startAnalysis = Date.now();
        
        // チャンネルデータを直接処理
        const leftChannel = audioBuffer.getChannelData(0);
        const rightChannel = audioBuffer.numberOfChannels > 1 ? 
            audioBuffer.getChannelData(1) : leftChannel;
        
        // 小さなチャンクに分割して処理（UI更新のため）
        const chunkSize = this.bufferSize;
        const totalSamples = audioBuffer.length;
        let processedSamples = 0;
        
        while (processedSamples < totalSamples) {
            const remaining = totalSamples - processedSamples;
            const currentChunkSize = Math.min(chunkSize, remaining);
            
            const leftChunk = leftChannel.subarray(processedSamples, processedSamples + currentChunkSize);
            const rightChunk = rightChannel.subarray(processedSamples, processedSamples + currentChunkSize);
            
            // データを送信
            if (this.onAudioData) {
                this.onAudioData({
                    leftChannel: leftChunk,
                    rightChannel: rightChunk,
                    frequencyData: new Uint8Array(analyser.frequencyBinCount),
                    timeDomainData: new Uint8Array(analyser.fftSize),
                    sampleRate: audioBuffer.sampleRate,
                    bufferSize: currentChunkSize,
                    timestamp: processedSamples / audioBuffer.sampleRate
                });
            }
            
            processedSamples += currentChunkSize;
            
            // 進捗を通知
            const progress = processedSamples / totalSamples;
            if (this.onOfflineComplete) {
                await new Promise(resolve => setTimeout(resolve, 0)); // UI更新のため
            }
        }
        
        const analysisTime = Date.now() - startAnalysis;
        console.log(`Offline analysis completed in ${analysisTime}ms (${(audioBuffer.duration / (analysisTime / 1000)).toFixed(1)}x realtime)`);
        
        // 完了を通知
        if (this.onOfflineComplete) {
            this.onOfflineComplete({
                duration: audioBuffer.duration,
                analysisTime: analysisTime
            });
        }
    }

    playFile() {
        if (!this.audioBuffer || this.isPlaying) return;
        
        // 新しいソースを作成（BufferSourceは使い捨て）
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.onended = () => {
            if (!this.isPaused) {
                this.isPlaying = false;
                if (this.onPlaybackEnded) {
                    this.onPlaybackEnded();
                }
            }
        };
        
        // ノードに接続
        this.source.connect(this.analyser);
        this.source.connect(this.splitter);
        
        // AudioWorkletまたはScriptProcessorに接続
        if (this.useWorklet && this.workletNode) {
            this.source.connect(this.workletNode);
            // AudioWorklet使用時はworkletNode→gainNode→destination経路のみ使用
            // (workletNodeが既にgainNodeに接続済み)
        } else if (this.scriptProcessor) {
            this.source.connect(this.scriptProcessor);
            // ScriptProcessor使用時はscriptProcessor→gainNode→destination経路を使用
        }
        
        // リアルタイムモードでAudioWorklet非使用時のみ、直接gainNodeに接続
        // (AudioWorklet使用時はworkletNode経由で出力されるため不要)
        if (this.enableAudioOutput && !this.useWorklet) {
            this.source.connect(this.gainNode);
        }
        
        // 再生開始（途中からまたは最初から）
        if (this.isPaused && this.pauseTime > 0) {
            this.source.start(0, this.pauseTime);
            this.startTime = this.audioContext.currentTime - this.pauseTime;
        } else {
            this.source.start(0);
            this.startTime = this.audioContext.currentTime;
            this.pauseTime = 0;
        }
        
        this.isPlaying = true;
        this.isPaused = false;
        
        // 再生位置の更新
        this.updatePlaybackPosition();
    }

    pauseFile() {
        if (!this.isPlaying) return;
        
        this.pauseTime = this.getCurrentTime();
        
        // onendedイベントの発火を防ぐ
        if (this.source) {
            this.source.onended = null;
            this.source.stop();
        }
        
        this.isPlaying = false;
        this.isPaused = true;
    }

    stopFile() {
        if (this.source && this.isPlaying) {
            // onendedイベントの発火を防ぐ
            this.source.onended = null;
            this.source.stop();
        }
        this.isPlaying = false;
        this.isPaused = false;
        this.pauseTime = 0;
        this.startTime = 0;
    }

    seekFile(time) {
        const wasPlaying = this.isPlaying;
        
        // 再生中なら一旦停止
        if (this.isPlaying && this.source) {
            try {
                // onendedイベントが発火するのを防ぐため、先にハンドラーをクリア
                this.source.onended = null;
                this.source.stop();
            } catch (e) {
                console.error('Error stopping source:', e);
            }
        }
        
        // 状態をリセット
        this.isPlaying = false;
        this.isPaused = true;
        this.pauseTime = Math.max(0, Math.min(time, this.audioBuffer.duration));
        
        // 再生中だった場合のみ、即座に再開
        if (wasPlaying) {
            this.playFile();
        }
    }

    getCurrentTime() {
        if (!this.audioBuffer) return 0;
        
        if (this.isPlaying) {
            return Math.min(
                this.audioContext.currentTime - this.startTime,
                this.audioBuffer.duration
            );
        }
        
        return this.pauseTime;
    }

    getDuration() {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    updatePlaybackPosition() {
        if (!this.isPlaying) return;
        
        const currentTime = this.getCurrentTime();
        
        if (this.onPlaybackUpdate) {
            this.onPlaybackUpdate({
                currentTime: currentTime,
                duration: this.audioBuffer.duration
            });
        }
        
        if (this.isPlaying && currentTime < this.audioBuffer.duration) {
            requestAnimationFrame(() => this.updatePlaybackPosition());
        }
    }

    async startMicrophoneInput() {
        // マイク入力の取得
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                latency: 0,
                channelCount: 2
            }
        });

        this.source = this.audioContext.createMediaStreamSource(this.stream);
    }

    async startDesktopAudioInput() {
        // デスクトップオーディオのキャプチャ
        // Chrome: getDisplayMedia with audio
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: true, // ビデオも必要（仕様上）
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 2
                }
            });

            // オーディオトラックのみ使用
            const audioTracks = this.stream.getAudioTracks();
            const videoTracks = this.stream.getVideoTracks();
            
            if (audioTracks.length === 0) {
                throw new Error('No audio track available in desktop capture');
            }

            // ビデオトラックを即座に停止（CPU負荷軽減）
            videoTracks.forEach(track => {
                track.stop();
                this.stream.removeTrack(track);
            });
            
            console.log('Video tracks stopped, audio-only mode');

            this.source = this.audioContext.createMediaStreamSource(this.stream);
        } catch (error) {
            // フォールバック：マイク入力
            console.warn('Desktop audio capture not available, falling back to microphone');
            await this.startMicrophoneInput();
        }
    }

    async setupAudioNodes() {
        // アナライザーノード
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.analyser.smoothingTimeConstant = 0.5;

        // チャンネルスプリッター（ステレオ分離）
        this.splitter = this.audioContext.createChannelSplitter(2);

        // ゲインノード（マイク/デスクトップ入力時はミュート、ファイル再生時は出力）
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.enableAudioOutput ? 1.0 : 0;

        // AudioWorkletを試みる
        try {
            await this.audioContext.audioWorklet.addModule('js/audio-worklet-processor.js');
            
            // AudioWorkletNodeを作成
            this.workletNode = new AudioWorkletNode(this.audioContext, 'sound-graffiti-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });
            
            // Workletからのメッセージを受信
            this.workletNode.port.onmessage = (event) => {
                this.processAudioFromWorklet(event.data);
            };
            
            // ノードの接続（sourceがある場合のみ接続 = マイク/デスクトップモード）
            if (this.source) {
                this.source.connect(this.analyser);
                this.source.connect(this.splitter);
                this.source.connect(this.workletNode);
            }
            
            this.workletNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            this.useWorklet = true;
            console.log('AudioWorklet initialized successfully');
            
        } catch (error) {
            // フォールバック: ScriptProcessorNode
            console.warn('AudioWorklet not available, using ScriptProcessor:', error);
            this.useWorklet = false;
            
            this.scriptProcessor = this.audioContext.createScriptProcessor(
                this.bufferSize, 
                2,
                2
            );
            
            this.scriptProcessor.onaudioprocess = (event) => {
                this.processAudio(event);
            };
            
            if (this.source) {
                this.source.connect(this.analyser);
                this.source.connect(this.splitter);
                this.source.connect(this.scriptProcessor);
            }
            
            this.scriptProcessor.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
        }
    }

    processAudioFromWorklet(data) {
        // AudioWorkletから受信したデータを処理
        const leftChannel = data.leftChannel;
        const rightChannel = data.rightChannel;

        // 周波数データ
        const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(frequencyData);

        // タイムドメインデータ
        const timeDomainData = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(timeDomainData);

        // オーディオデータをメーターに渡す
        if (this.onAudioData) {
            this.onAudioData({
                leftChannel: leftChannel,
                rightChannel: rightChannel,
                frequencyData: frequencyData,
                timeDomainData: timeDomainData,
                sampleRate: this.audioContext.sampleRate,
                bufferSize: this.bufferSize,
                timestamp: this.audioContext.currentTime
            });
        }
    }

    processAudio(event) {
        // ScriptProcessorNode用（フォールバック）
        const inputBuffer = event.inputBuffer;
        const leftChannel = inputBuffer.getChannelData(0);
        const rightChannel = inputBuffer.getChannelData(1);

        // 周波数データ
        const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(frequencyData);

        // タイムドメインデータ
        const timeDomainData = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(timeDomainData);

        // オーディオデータをメーターに渡す
        if (this.onAudioData) {
            this.onAudioData({
                leftChannel: leftChannel,
                rightChannel: rightChannel,
                frequencyData: frequencyData,
                timeDomainData: timeDomainData,
                sampleRate: this.audioContext.sampleRate,
                bufferSize: this.bufferSize,
                timestamp: this.audioContext.currentTime
            });
        }
    }

    stop() {
        // ファイル再生の停止
        if (this.audioBuffer) {
            this.stopFile();
            this.audioBuffer = null;
        }
        
        // ストリームの停止
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // ノードの切断
        if (this.source) {
            try {
                this.source.disconnect();
            } catch (e) {
                // Already disconnected
            }
            this.source = null;
        }

        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode.port.close();
            this.workletNode = null;
        }

        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }

        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        // AudioContextのクローズ
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        console.log('Audio engine stopped');
    }

    // サンプルをdBに変換
    static sampleToDb(sample) {
        if (sample === 0) return -Infinity;
        return 20 * Math.log10(Math.abs(sample));
    }

    // RMS計算
    static calculateRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / samples.length);
    }

    // Peak計算
    static calculatePeak(samples) {
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
        }
        return peak;
    }
}
