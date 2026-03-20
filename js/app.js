/**
 * Sound Graffiti - Main Application
 * ラウドネスメーターのメインアプリケーション
 */

// デバッグモード（false = 本番環境、true = 開発環境）
const DEBUG = false;

// 本番環境ではコンソール出力を無効化
if (!DEBUG) {
    console.log = () => {};
    console.warn = () => {};
    // console.error は残す（エラーは常に表示）
}

class SoundGraffiti {
    constructor() {
        this.audioEngine = null;
        this.meters = {};
        this.layoutManager = null;
        this.isMonitoring = false;
        
        this.init();
    }

    init() {
        // UI要素の取得
        this.elements = {
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            resetBtn: document.getElementById('reset-btn'),
            inputSource: document.getElementById('input-source'),
            meterToggles: document.querySelectorAll('.meter-toggle'),
            themeToggle: document.getElementById('theme-toggle'),
            targetLufs: document.getElementById('target-lufs'),
            customLufs: document.getElementById('custom-lufs'),
            fftSize: document.getElementById('fft-size')
        };

        // ダークモードの初期化
        this.initTheme();

        // ターゲットLUFSの初期化
        this.initTargetLufs();
        
        // FFTサイズの初期化
        this.initFftSize();

        // イベントリスナーの設定
        this.setupEventListeners();

        // Layout Managerの初期化
        this.layoutManager = new LayoutManager();

        // メータークラスの初期化
        this.initializeMeters();

        console.log('Sound Graffiti initialized');
    }

    initializeMeters() {
        // 各メーターのインスタンスを作成（ターゲットLUFS値を渡す）
        const targetLufs = this.getTargetLufs();
        this.meters.lufs = new LUFSMeter('lufs-canvas', targetLufs);
        this.meters.truepeak = new TruePeakMeter('truepeak-canvas');
        this.meters.rms = new RMSMeter('rms-canvas');
        this.meters.vu = new VUMeter('vu-canvas');
        this.meters.spectrum = new SpectrumAnalyzer('spectrum-canvas');
        this.meters.stereofield = new StereoField('stereofield-canvas');
        this.meters.history = new History('history-canvas', targetLufs);
    }

    setupEventListeners() {
        // 開始ボタン
        this.elements.startBtn.addEventListener('click', () => this.startMonitoring());
        
        // 停止ボタン
        this.elements.stopBtn.addEventListener('click', () => this.stopMonitoring());
        
        // リセットボタン
        this.elements.resetBtn.addEventListener('click', () => this.resetMeters());

        // テーマ切り替えボタン
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());

        // メーター表示切り替え
        this.elements.meterToggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                this.layoutManager.toggleMeter(e.target.dataset.meter, e.target.checked);
            });
        });

        // ヘルプボタン
        document.getElementById('help-btn').addEventListener('click', () => {
            this.showHelp();
        });

        // ヘルプモーダルを閉じる
        const helpModal = document.getElementById('help-modal');
        document.querySelector('.help-modal-close').addEventListener('click', () => {
            helpModal.classList.remove('active');
        });
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.remove('active');
            }
        });

        // Settingsボタン
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showSettings();
        });

        // Settingsモーダルを閉じる
        const settingsModal = document.getElementById('settings-modal');
        document.querySelector('.settings-modal-close').addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
        });

        // ターゲットLUFS変更
        this.elements.targetLufs.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                document.querySelector('.custom-lufs-section').style.display = 'flex';
                this.elements.customLufs.focus();
            } else {
                document.querySelector('.custom-lufs-section').style.display = 'none';
                this.updateTargetLufs();
            }
        });

        this.elements.customLufs.addEventListener('change', () => {
            this.updateTargetLufs();
        });
        
        // FFTサイズ変更
        this.elements.fftSize.addEventListener('change', () => {
            this.updateFftSize();
        });
    }

    initTargetLufs() {
        // localStorageから基準値を読み込み
        const savedTarget = localStorage.getItem('targetLufs') || '-23';
        const savedCustom = localStorage.getItem('customLufs') || '-23';
        
        // プリセット値にあるかチェック
        const presetOptions = ['-23', '-14', '-16'];
        if (presetOptions.includes(savedTarget)) {
            this.elements.targetLufs.value = savedTarget;
            document.querySelector('.custom-lufs-section').style.display = 'none';
        } else {
            this.elements.targetLufs.value = 'custom';
            this.elements.customLufs.value = savedTarget;
            document.querySelector('.custom-lufs-section').style.display = 'flex';
        }
    }

    getTargetLufs() {
        if (this.elements.targetLufs.value === 'custom') {
            return parseFloat(this.elements.customLufs.value);
        }
        return parseFloat(this.elements.targetLufs.value);
    }

    updateTargetLufs() {
        const targetLufs = this.getTargetLufs();
        
        // localStorageに保存
        localStorage.setItem('targetLufs', targetLufs.toString());
        if (this.elements.targetLufs.value === 'custom') {
            localStorage.setItem('customLufs', this.elements.customLufs.value);
        }
        
        // メーターの基準値を更新
        this.meters.lufs.targetLufs = targetLufs;
        this.meters.history.targetLufs = targetLufs;
        
        // 再描画
        this.meters.lufs.draw();
        this.meters.history.draw();
        
        console.log('Target LUFS updated to:', targetLufs);
    }
    
    initFftSize() {
        // localStorageからFFTサイズを読み込み
        const savedFftSize = localStorage.getItem('fftSize') || '4096';
        this.elements.fftSize.value = savedFftSize;
    }
    
    getFftSize() {
        return parseInt(this.elements.fftSize.value);
    }
    
    updateFftSize() {
        const fftSize = this.getFftSize();
        
        // localStorageに保存
        localStorage.setItem('fftSize', fftSize.toString());
        
        // スペクトラムアナライザーをリセット（配列サイズ変更のため）
        if (this.meters.spectrum) {
            this.meters.spectrum.reset();
        }
        
        // 監視中の場合は自動で再起動
        if (this.isMonitoring) {
            const inputType = this.elements.inputSource.value;
            console.log('FFT Size changed, restarting audio engine...');
            this.stopMonitoring();
            // 少し待ってから再起動
            setTimeout(() => {
                this.startMonitoring();
            }, 100);
        }
        
        console.log('FFT Size updated to:', fftSize);
    }

    initTheme() {
        // localStorageからテーマを取得、デフォルトはlight
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeButton(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeButton(newTheme);
        
        // 全てのメーターを再描画してテーマを反映
        this.redrawAllMeters();
    }
    
    redrawAllMeters() {
        // 各メーターのdraw()メソッドを呼び出して再描画
        Object.values(this.meters).forEach(meter => {
            if (meter && typeof meter.draw === 'function') {
                meter.draw();
            }
        });
    }

    updateThemeButton(theme) {
        const icon = this.elements.themeToggle.querySelector('.theme-icon');
        const text = this.elements.themeToggle.querySelector('.theme-toggle-text');
        
        if (theme === 'dark') {
            icon.textContent = '☀️';
            text.textContent = 'Light';
        } else {
            icon.textContent = '🌙';
            text.textContent = 'Dark';
        }
    }

    async startMonitoring() {
        try {
            const inputType = this.elements.inputSource.value;
            const fftSize = this.getFftSize();
            
            // Audio Engineの初期化（既存のインスタンスがある場合は停止して再作成）
            if (this.audioEngine) {
                this.audioEngine.stop();
            }
            this.audioEngine = new AudioEngine({ fftSize: fftSize });

            // オーディオ入力の開始
            await this.audioEngine.start(inputType);

            // メーターへのデータストリーム設定
            this.audioEngine.onAudioData = (data) => {
                this.updateMeters(data);
            };

            // UI更新
            this.elements.startBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
            this.elements.resetBtn.disabled = false;
            this.elements.inputSource.disabled = true;
            this.isMonitoring = true;

            console.log('Monitoring started');
        } catch (error) {
            console.error('Failed to start monitoring:', error);
            alert('マイクまたはオーディオ入力へのアクセスに失敗しました: ' + error.message);
        }
    }

    stopMonitoring() {
        if (this.audioEngine) {
            this.audioEngine.stop();
            this.audioEngine = null; // インスタンスを破棄して再起動時に新規作成
        }

        // UI更新
        this.elements.startBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
        this.elements.resetBtn.disabled = false; // Stop後もResetは使える
        this.elements.inputSource.disabled = false;
        this.isMonitoring = false;

        console.log('Monitoring stopped');
    }

    updateMeters(audioData) {
        // 各メーターを更新（表示されているもののみ）
        Object.entries(this.meters).forEach(([name, meter]) => {
            if (meter && typeof meter.update === 'function') {
                // メーターが表示されている場合のみ更新
                const panel = document.querySelector(`[data-meter="${name}"]`);
                if (panel && !panel.classList.contains('hidden')) {
                    meter.update(audioData);
                }
            }
        });

        // 値の表示更新
        this.updateDisplayValues();
    }

    updateDisplayValues() {
        // LUFS値
        if (this.meters.lufs) {
            const lufsData = this.meters.lufs.getValues();
            document.getElementById('lufs-integrated').textContent = 
                lufsData.integrated !== -Infinity ? `${lufsData.integrated.toFixed(1)} LUFS` : '-∞ LUFS';
            document.getElementById('lufs-shortterm').textContent = 
                lufsData.shortterm !== -Infinity ? `${lufsData.shortterm.toFixed(1)} LUFS` : '-∞ LUFS';
            document.getElementById('lufs-momentary').textContent = 
                lufsData.momentary !== -Infinity ? `${lufsData.momentary.toFixed(1)} LUFS` : '-∞ LUFS';
            document.getElementById('lra-value').textContent = 
                `${lufsData.lra.toFixed(1)} LU`;
        }

        // True Peak値
        if (this.meters.truepeak) {
            const peakData = this.meters.truepeak.getValues();
            document.getElementById('peak-left').textContent = 
                peakData.left !== -Infinity ? `${peakData.left.toFixed(1)} dBTP` : '-∞ dBTP';
            document.getElementById('peak-right').textContent = 
                peakData.right !== -Infinity ? `${peakData.right.toFixed(1)} dBTP` : '-∞ dBTP';
        }

        // RMS値
        if (this.meters.rms) {
            const rmsData = this.meters.rms.getValues();
            document.getElementById('rms-left').textContent = 
                rmsData.left !== -Infinity ? `${rmsData.left.toFixed(1)} dB` : '-∞ dB';
            document.getElementById('rms-right').textContent = 
                rmsData.right !== -Infinity ? `${rmsData.right.toFixed(1)} dB` : '-∞ dB';
        }
    }
    
    resetMeters() {
        // すべてのメーターをリセット
        Object.values(this.meters).forEach(meter => {
            if (meter && typeof meter.reset === 'function') {
                meter.reset();
            }
        });
        
        // 表示値もリセット
        document.getElementById('lufs-integrated').textContent = '-∞ LUFS';
        document.getElementById('lufs-shortterm').textContent = '-∞ LUFS';
        document.getElementById('lufs-momentary').textContent = '-∞ LUFS';
        document.getElementById('lra-value').textContent = '0.0 LU';
        document.getElementById('peak-left').textContent = '-∞ dBTP';
        document.getElementById('peak-right').textContent = '-∞ dBTP';
        document.getElementById('rms-left').textContent = '-∞ dB';
        document.getElementById('rms-right').textContent = '-∞ dB';
        
        // 各メーターを明示的に再描画（Stop中でも反映されるように）
        Object.values(this.meters).forEach(meter => {
            if (meter && typeof meter.draw === 'function') {
                meter.draw();
            }
        });
        
        console.log('All meters reset');
    }

    showHelp() {
        const helpModal = document.getElementById('help-modal');
        const helpTitle = document.getElementById('help-title');
        const helpBody = document.getElementById('help-body');

        helpTitle.textContent = 'Sound Graffiti - メーター使い方ガイド';
        helpBody.innerHTML = `
            <div class="help-section">
                <h3>📊 LUFS Meter (Integrated Loudness)</h3>
                <p><strong>グラフ表示:</strong></p>
                <ul>
                    <li><strong style="color: #86efac;">●</strong> <strong>緑のバー (Integrated)</strong>: 開始からの統合ラウドネス</li>
                    <li><strong style="color: #fbbf24;">●</strong> <strong>黄色のバー (Short-term)</strong>: 直近3秒間</li>
                    <li><strong style="color: #fb923c;">●</strong> <strong>オレンジのバー (Momentary)</strong>: 直近400ms</li>
                    <li><strong style="color: #a5b4fc;">━</strong> <strong>青い横線</strong>: ターゲット基準値（変更可能）</li>
                </ul>
                <p><strong>💡 ポイント:</strong> Integratedがターゲット基準値付近なら適正レベル</p>
                
                <p><strong>📋 プラットフォーム別推奨値:</strong></p>
                <ul>
                    <li><strong>放送 (EBU R128)</strong>: -23 LUFS</li>
                    <li><strong>YouTube</strong>: -14 LUFS</li>
                    <li><strong>Spotify</strong>: -14 LUFS</li>
                    <li><strong>Apple Music</strong>: -16 LUFS</li>
                    <li><strong>Twitch</strong>: -14 LUFS</li>
                    <li><strong>Amazon Music</strong>: -14 LUFS</li>
                </ul>
                <p><em>※ ⚙ Settingsから基準値を変更できます</em></p>
            </div>

            <div class="help-section">
                <h3>🎚️ True Peak Meter</h3>
                <p><strong>グラフ表示:</strong></p>
                <ul>
                    <li><strong>緑〜黄〜オレンジ〜赤</strong>: レベルによるグラデーション</li>
                    <li><strong style="color: #a5b4fc;">│</strong> <strong>青い縦線</strong>: ピークホールド（過去2秒）</li>
                    <li><strong style="color: #fb923c;">│ 0dB</strong>: クリッピング境界線</li>
                </ul>
                <p><strong>💡 ポイント:</strong> 0 dBTP超過で歪み発生。放送基準: -1 dBTP以下</p>
            </div>

            <div class="help-section">
                <h3>🎛️ VU Meter</h3>
                <p><strong>グラフ表示:</strong></p>
                <ul>
                    <li><strong style="color: #86efac;">●</strong> <strong>緑の針</strong>: -20〜0 VU（安全範囲）</li>
                    <li><strong style="color: #fb923c;">●</strong> <strong>オレンジの針</strong>: 0〜+3 VU（注意）</li>
                    <li><strong style="color: #f87171;">●</strong> <strong>赤い針</strong>: +3 VU超過（過大入力）</li>
                    <li><strong style="color: #a5b4fc;">0</strong>: 基準レベル（-18 dBFS）</li>
                </ul>
                <p><strong>💡 ポイント:</strong> 針が0 VU付近で揺れるのが理想的。YouTube等の高レベル音源では+3〜+6 VUになることがあります</p>
            </div>

            <div class="help-section">
                <h3>📈 Spectrum Analyzer</h3>
                <p><strong>グラフ表示:</strong></p>
                <ul>
                    <li><strong>低域（20-200Hz）</strong>: キックドラム、ベース</li>
                    <li><strong>中域（200-2kHz）</strong>: ボーカル、楽器</li>
                    <li><strong>高域（2k-20kHz）</strong>: シンバル、倍音</li>
                </ul>
            </div>

            <div class="help-section">
                <h3>🔊 Stereo Field</h3>
                <p><strong>左側 - ステレオフィールド:</strong></p>
                <ul>
                    <li><strong>M（上）/L（左）/R（右）/S（下）</strong>: 音像定位</li>
                    <li><strong style="color: #a5b4fc;">●</strong> 青い点: リアルタイム位置</li>
                </ul>
                <p><strong>右側 - Phase Correlation:</strong></p>
                <ul>
                    <li><strong style="color: #86efac;">+1</strong>: 完全同相（モノラル）</li>
                    <li><strong style="color: #fbbf24;">0</strong>: 良好なステレオ</li>
                    <li><strong style="color: #f87171;">-1</strong>: 逆相（要注意）</li>
                </ul>
                <p><strong>💡 ポイント:</strong> Correlationが-1に近いとモノラル再生で音が消える</p>
            </div>

            <div class="help-section">
                <h3>📉 Loudness History</h3>
                <p><strong>グラフ表示:</strong></p>
                <ul>
                    <li><strong style="color: #86efac;">━</strong> 緑: Integrated</li>
                    <li><strong style="color: #fbbf24;">━</strong> 黄: Short-term</li>
                    <li><strong style="color: #fb923c;">━</strong> オレンジ: Momentary</li>
                    <li><strong style="color: #a5b4fc;">━</strong> 青い横線: ターゲット基準値</li>
                </ul>
                <p><strong>💡 ポイント:</strong> 楽曲全体のラウドネス変化を時系列で確認</p>
            </div>

            <div class="help-section">
                <h3>⚙️ 操作方法</h3>
                <ul>
                    <li><strong>▶ Start Monitoring</strong>: 音声モニタリング開始</li>
                    <li><strong>■ Stop</strong>: モニタリング停止</li>
                    <li><strong>🔄 Reset</strong>: すべての値をリセット</li>
                    <li><strong>Input</strong>: マイク入力またはデスクトップオーディオ選択</li>
                    <li><strong>⚙ Settings</strong>: LUFS基準値の変更（プラットフォームに応じて選択）</li>
                    <li><strong>? Help</strong>: このヘルプを表示</li>
                    <li><strong>Display</strong>: 各メーターの表示/非表示切り替え</li>
                    <li><strong>ドラッグ操作</strong>: パネルヘッダーの⋮⋮をドラッグして並び替え</li>
                    <li><strong>🌙/☀️</strong>: ダークモード/ライトモード切り替え</li>
                </ul>
            </div>
        `;
        
        helpModal.classList.add('active');
    }

    showSettings() {
        const settingsModal = document.getElementById('settings-modal');
        settingsModal.classList.add('active');
    }
}

// アプリケーション起動
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SoundGraffiti();
});
