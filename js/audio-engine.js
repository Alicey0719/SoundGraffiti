/**
 * Audio Engine - Web Audio API処理
 * 低レイテンシーのオーディオ処理エンジン
 */

class AudioEngine {
    constructor(options = {}) {
        this.audioContext = null;
        this.source = null;
        this.analyser = null;
        this.scriptProcessor = null;
        this.stream = null;
        this.onAudioData = null;
        this.gainNode = null; // ミュート用ゲインノード
        
        // バッファサイズ（大きいほど処理負荷が低い）
        this.bufferSize = 4096; // 2048から4096に変更して負荷軽減
        
        // FFTサイズ（デフォルト4096、外部から設定可能）
        this.fftSize = options.fftSize || 4096;
        
        // チャンネル分離用
        this.splitter = null;
    }

    async start(inputType) {
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
            }

            // 解析ノードの作成
            this.setupAudioNodes();

            console.log('Audio engine started');
            console.log('Sample rate:', this.audioContext.sampleRate);
            console.log('Buffer size:', this.bufferSize);
            console.log('FFT size:', this.fftSize);
        } catch (error) {
            throw new Error('Audio input initialization failed: ' + error.message);
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

    setupAudioNodes() {
        // アナライザーノード
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize; // 設定可能なFFTサイズ
        this.analyser.smoothingTimeConstant = 0.5; // スムージングを強化（0.3→0.5）

        // チャンネルスプリッター（ステレオ分離）
        this.splitter = this.audioContext.createChannelSplitter(2);

        // ScriptProcessorNode（リアルタイム処理）
        // 注: 将来的にはAudioWorkletに移行すべき
        this.scriptProcessor = this.audioContext.createScriptProcessor(
            this.bufferSize, 
            2, // 入力チャンネル
            2  // 出力チャンネル
        );

        // オーディオ処理コールバック
        this.scriptProcessor.onaudioprocess = (event) => {
            this.processAudio(event);
        };

        // ゲインノード（音を出さないようにミュート）
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0; // 完全にミュート

        // ノードの接続
        this.source.connect(this.analyser);
        this.source.connect(this.splitter);
        this.source.connect(this.scriptProcessor);
        
        // ScriptProcessorは出力に接続しないとFirefoxで動作しないが、
        // ゲインノード経由でミュートして接続
        this.scriptProcessor.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
    }

    processAudio(event) {
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
        // ストリームの停止
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // ノードの切断
        if (this.source) {
            this.source.disconnect();
            this.source = null;
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
