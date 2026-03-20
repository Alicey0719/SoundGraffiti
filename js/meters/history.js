/**
 * Loudness History - ラウドネスの時系列表示
 * 時間軸でのラウドネス推移を記録・表示
 */

class History {
    constructor(canvasId, targetLufs = -23) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.targetLufs = targetLufs; // 基準値（デフォルト: -23 LUFS）
        
        this.setupCanvas();
        
        // ヒストリーデータ
        this.history = [];
        this.maxHistory = 300; // 約30秒分（100msごと）
        
        // 時間管理
        this.blockSize = 0.1; // 100ms
        this.samplesPerBlock = 0;
        this.currentSamples = 0;
        
        // 表示範囲
        this.minLUFS = -60;
        this.maxLUFS = 0;
        
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
        this.sampleRate = audioData.sampleRate;
        this.samplesPerBlock = Math.floor(this.sampleRate * this.blockSize);
        
        this.currentSamples += audioData.bufferSize;
        
        // ブロック単位でデータを記録
        if (this.currentSamples >= this.samplesPerBlock) {
            const leftChannel = audioData.leftChannel;
            const rightChannel = audioData.rightChannel;
            
            // 簡易的なラウドネス計算（RMS）
            const rmsL = this.calculateRMS(leftChannel);
            const rmsR = this.calculateRMS(rightChannel);
            const rms = (rmsL + rmsR) / 2;
            
            const lufs = rms > 0 ? 20 * Math.log10(rms) - 23 : -Infinity;
            
            // Peak計算
            const peakL = this.calculatePeak(leftChannel);
            const peakR = this.calculatePeak(rightChannel);
            const peakMax = Math.max(peakL, peakR);
            const peakDB = peakMax > 0 ? 20 * Math.log10(peakMax) : -Infinity;
            
            // ヒストリーに追加
            this.history.push({
                timestamp: audioData.timestamp,
                lufs: lufs,
                peak: peakDB
            });
            
            if (this.history.length > this.maxHistory) {
                this.history.shift();
            }
            
            this.currentSamples = 0;
        }
    }
    
    calculateRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / samples.length);
    }
    
    calculatePeak(samples) {
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
        }
        return peak;
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
        
        // ヒストリーグラフ
        if (this.history.length > 0) {
            this.drawHistory(ctx, width, height);
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
        
        // LUFS軸
        const lufsValues = [-60, -50, -40, -30, -23, -20, -10, 0];
        
        for (const lufs of lufsValues) {
            const y = height - ((lufs - this.minLUFS) / (this.maxLUFS - this.minLUFS)) * height;
            
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            ctx.fillText(lufs + ' LUFS', 5, y - 3);
        }
        
        // ターゲットLUFS基準線
        const yTarget = height - ((this.targetLufs - this.minLUFS) / (this.maxLUFS - this.minLUFS)) * height;
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, yTarget);
        ctx.lineTo(width, yTarget);
        ctx.stroke();
        
        // 時間軸（秒）
        ctx.strokeStyle = '#cbd5e0';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#a0aec0';
        
        const timeStep = 5; // 5秒ごと
        const secondsPerSample = this.blockSize;
        const totalSeconds = this.history.length * secondsPerSample;
        
        for (let t = 0; t <= totalSeconds; t += timeStep) {
            const x = (t / totalSeconds) * width;
            
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            ctx.fillText(t + 's', x + 2, height - 5);
        }
    }
    
    drawHistory(ctx, width, height) {
        const historyLength = this.history.length;
        
        // LUFS履歴（塗りつぶし）
        ctx.beginPath();
        
        for (let i = 0; i < historyLength; i++) {
            const data = this.history[i];
            const x = (i / this.maxHistory) * width;
            const lufs = data.lufs !== -Infinity ? data.lufs : this.minLUFS;
            const lufsClamped = Math.max(this.minLUFS, Math.min(this.maxLUFS, lufs));
            const y = height - ((lufsClamped - this.minLUFS) / (this.maxLUFS - this.minLUFS)) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(134, 239, 172, 0.5)');
        gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
        gradient.addColorStop(1, 'rgba(251, 146, 60, 0.2)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // LUFS線
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(134, 239, 172, 0.3)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        
        for (let i = 0; i < historyLength; i++) {
            const data = this.history[i];
            const x = (i / this.maxHistory) * width;
            const lufs = data.lufs !== -Infinity ? data.lufs : this.minLUFS;
            const lufsClamped = Math.max(this.minLUFS, Math.min(this.maxLUFS, lufs));
            const y = height - ((lufsClamped - this.minLUFS) / (this.maxLUFS - this.minLUFS)) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Peak線
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(251, 146, 60, 0.3)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        
        for (let i = 0; i < historyLength; i++) {
            const data = this.history[i];
            const x = (i / this.maxHistory) * width;
            const peak = data.peak !== -Infinity ? data.peak : this.minLUFS;
            const peakClamped = Math.max(this.minLUFS, Math.min(this.maxLUFS, peak));
            const y = height - ((peakClamped - this.minLUFS) / (this.maxLUFS - this.minLUFS)) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    reset() {
        this.history = [];
        this.currentSamples = 0;
        console.log('History reset');
    }
}
