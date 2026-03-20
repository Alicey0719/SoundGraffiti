/**
 * Spectrum Analyzer - 周波数スペクトラム表示
 * FFT解析による周波数分布の可視化
 */

class SpectrumAnalyzer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.setupCanvas();
        
        this.frequencyData = null;
        this.smoothedData = null;
        
        // スムージングパラメータ
        this.smoothingFactor = 0.7;
        
        // 表示範囲（20Hz-20kHz、DAW/ミキサーEQ風の配分）
        this.minFreq = 20;
        this.maxFreq = 20000;
        this.minDB = -80;
        this.maxDB = 6;  // 0 → 6dBに変更（クリッピング付近も表示）
        
        this.init();
        this.startAnimation();
    }
    
    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }
    
    init() {
        this.draw();
    }
    
    update(audioData) {
        this.frequencyData = audioData.frequencyData;
        this.sampleRate = audioData.sampleRate;
        
        // スムージング
        if (!this.smoothedData || this.smoothedData.length !== this.frequencyData.length) {
            // 配列サイズが変わった場合（FFTサイズ変更）は再初期化
            this.smoothedData = new Float32Array(this.frequencyData.length);
            for (let i = 0; i < this.frequencyData.length; i++) {
                this.smoothedData[i] = this.frequencyData[i];
            }
        } else {
            for (let i = 0; i < this.frequencyData.length; i++) {
                this.smoothedData[i] = 
                    this.smoothingFactor * this.smoothedData[i] + 
                    (1 - this.smoothingFactor) * this.frequencyData[i];
            }
        }
    }
    
    startAnimation() {
        const animate = () => {
            this.draw();
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    draw() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        
        // テーマに応じた背景色を取得
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const bgColor1 = isDark ? '#2d3748' : '#f7fafc';
        const bgColor2 = isDark ? '#1a202c' : '#edf2f7';
        
        // 背景（パステルグラデーション）
        const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, bgColor1);
        bgGradient.addColorStop(1, bgColor2);
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, width, height);
        
        // グリッド
        this.drawGrid(ctx, width, height);
        
        // スペクトラム
        if (this.smoothedData) {
            this.drawSpectrum(ctx, width, height);
            
            // FFTサイズと周波数分解能を表示（デバッグ情報）
            if (this.sampleRate && this.smoothedData) {
                const fftSize = this.smoothedData.length * 2;
                const freqResolution = (this.sampleRate / fftSize).toFixed(1);
                
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const infoColor = isDark ? '#9ca3af' : '#6b7280';
                
                ctx.font = 'bold 11px "LINE Seed JP", sans-serif';
                ctx.fillStyle = infoColor;
                ctx.textAlign = 'right';
                ctx.fillText(`FFT: ${fftSize} (${freqResolution}Hz/bin)`, width - 10, 20);
                ctx.textAlign = 'left'; // リセット
            }
        }
    }
    
    drawGrid(ctx, width, height) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? '#4a5568' : '#cbd5e0';
        const textColor = isDark ? '#cbd5e0' : '#a0aec0';
        
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '10px "LINE Seed JP", sans-serif';
        ctx.fillStyle = textColor;
        
        // 周波数軸（対数スケール、DAW/ミキサーEQ風の配分）
        const freqMarks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
        
        for (const freq of freqMarks) {
            // 表示範囲外はスキップ
            if (freq < this.minFreq || freq > this.maxFreq) continue;
            
            const x = this.freqToX(freq, width);
            
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            // ラベル
            let label;
            if (freq >= 1000) {
                label = (freq / 1000) + 'k';
            } else {
                label = freq.toString();
            }
            ctx.fillText(label, x - 10, height - 5);
        }
        
        // dB軸
        const dbMarks = [-60, -40, -20, 0, 6];
        
        for (const db of dbMarks) {
            const y = ((this.maxDB - db) / (this.maxDB - this.minDB)) * height;
            
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            ctx.fillText(db + 'dB', 5, y - 3);
        }
    }
    
    drawSpectrum(ctx, width, height) {
        if (!this.smoothedData || !this.sampleRate) return;
        
        const binCount = this.smoothedData.length;
        const nyquist = this.sampleRate / 2;
        
        // 低域を高密度サンプリング、中高域は通常密度（パフォーマンス最適化）
        const lowFreqBoundary = 800; // 800Hz以下を高密度に
        const minLog = Math.log10(this.minFreq);
        const maxLog = Math.log10(this.maxFreq);
        const lowBoundaryLog = Math.log10(lowFreqBoundary);
        
        // 低域の画面上の位置を計算（累乗適用後）
        const lowBoundaryT = (lowBoundaryLog - minLog) / (maxLog - minLog);
        const lowBoundaryPos = Math.pow(lowBoundaryT, 1.5);
        
        // サンプリング密度：低域2倍、中高域1倍
        const lowFreqPoints = Math.floor(width * lowBoundaryPos * 2);
        const highFreqPoints = Math.floor(width * (1 - lowBoundaryPos));
        const totalPoints = lowFreqPoints + highFreqPoints;
        
        // パス作成
        ctx.beginPath();
        
        let firstPoint = true;
        
        for (let i = 0; i < totalPoints; i++) {
            let t, freq;
            
            if (i < lowFreqPoints) {
                // 低域：高密度サンプリング
                const lowT = i / lowFreqPoints;
                const tRaw = lowT * lowBoundaryT;
                t = Math.pow(tRaw, 1.5);
            } else {
                // 中高域：通常密度
                const highT = (i - lowFreqPoints) / highFreqPoints;
                const tRaw = lowBoundaryT + highT * (1 - lowBoundaryT);
                t = Math.pow(tRaw, 1.5);
            }
            
            // t から周波数を逆算
            const tLinear = Math.pow(t, 1/1.5);
            const freqLog = minLog + tLinear * (maxLog - minLog);
            freq = Math.pow(10, freqLog);
            
            // 周波数に対応するFFTビンを計算
            const binIndex = (freq / nyquist) * binCount;
            const bin = Math.floor(binIndex);
            
            if (bin < 0 || bin >= binCount - 1) continue;
            
            // 線形補間でスムーズな値を取得
            const frac = binIndex - bin;
            const value = this.smoothedData[bin] * (1 - frac) + this.smoothedData[bin + 1] * frac;
            
            // バイトデータをdBに変換
            const db = (value / 255) * (this.maxDB - this.minDB) + this.minDB;
            
            const x = t * width; // X座標はtから直接計算（すでに累乗適用済み）
            const y = ((this.maxDB - db) / (this.maxDB - this.minDB)) * height;
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        // グラデーション塗りつぶし
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(165, 180, 252, 0.7)');
        gradient.addColorStop(0.5, 'rgba(196, 181, 253, 0.5)');
        gradient.addColorStop(1, 'rgba(251, 207, 232, 0.2)');
        
        ctx.fillStyle = gradient;
        ctx.shadowColor = 'rgba(165, 180, 252, 0.3)';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // 線
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
    
    freqToX(freq, width) {
        // 対数スケール（累乗で低域を圧縮、DAW/ミキサーEQ風）
        const minLog = Math.log10(this.minFreq);
        const maxLog = Math.log10(this.maxFreq);
        const freqLog = Math.log10(freq);
        
        const t = (freqLog - minLog) / (maxLog - minLog);
        return Math.pow(t, 1.5) * width; // 1.5乗で調整
    }
    
    reset() {
        this.frequencyData = null;
        this.smoothedData = null;
        console.log('Spectrum analyzer reset');
    }
}
