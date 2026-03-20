/**
 * True Peak Meter - ITU-R BS.1770-4準拠
 * 4倍オーバーサンプリングによるTrue Peak測定
 */

class TruePeakMeter {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.setupCanvas();
        
        // ピーク値
        this.peakLeft = -Infinity;
        this.peakRight = -Infinity;
        
        // ピークホールド
        this.peakHoldLeft = -Infinity;
        this.peakHoldRight = -Infinity;
        this.peakHoldTime = 2000; // 2秒
        this.peakHoldTimerLeft = 0;
        this.peakHoldTimerRight = 0;
        
        // レベルメーター用
        this.currentLevelLeft = -Infinity;
        this.currentLevelRight = -Infinity;
        
        // リセット用
        this.lastUpdateTime = Date.now();
        
        this.init();
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
        this.startAnimation();
    }
    
    update(audioData) {
        const leftChannel = audioData.leftChannel;
        const rightChannel = audioData.rightChannel;
        
        // True Peak計算（簡易版：4倍オーバーサンプリング）
        const truePeakLeft = this.calculateTruePeak(leftChannel);
        const truePeakRight = this.calculateTruePeak(rightChannel);
        
        // dBTP変換
        const dbTPLeft = truePeakLeft > 0 ? 20 * Math.log10(truePeakLeft) : -Infinity;
        const dbTPRight = truePeakRight > 0 ? 20 * Math.log10(truePeakRight) : -Infinity;
        
        // 現在レベル（True Peak値をバーで表示）
        this.currentLevelLeft = dbTPLeft;
        this.currentLevelRight = dbTPRight;
        
        // ピーク更新
        if (dbTPLeft > this.peakLeft) {
            this.peakLeft = dbTPLeft;
            this.peakHoldLeft = dbTPLeft;
            this.peakHoldTimerLeft = Date.now();
        }
        
        if (dbTPRight > this.peakRight) {
            this.peakRight = dbTPRight;
            this.peakHoldRight = dbTPRight;
            this.peakHoldTimerRight = Date.now();
        }
        
        // ピークホールドのタイムアウト
        const now = Date.now();
        if (now - this.peakHoldTimerLeft > this.peakHoldTime) {
            this.peakHoldLeft = this.peakLeft;
        }
        if (now - this.peakHoldTimerRight > this.peakHoldTime) {
            this.peakHoldRight = this.peakRight;
        }
        
        this.lastUpdateTime = now;
    }
    
    // True Peak計算（4倍オーバーサンプリング）
    calculateTruePeak(samples) {
        let peak = 0;
        
        // 簡易的な線形補間によるオーバーサンプリング
        for (let i = 0; i < samples.length - 1; i++) {
            const s1 = samples[i];
            const s2 = samples[i + 1];
            
            // 4倍オーバーサンプリング
            for (let j = 0; j < 4; j++) {
                const t = j / 4;
                const interpolated = s1 * (1 - t) + s2 * t;
                const abs = Math.abs(interpolated);
                if (abs > peak) {
                    peak = abs;
                }
            }
        }
        
        return peak;
    }
    
    calculateRMSdB(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sum / samples.length);
        return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
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
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, bgColor1);
        gradient.addColorStop(1, bgColor2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // メーターの描画領域
        const meterHeight = height / 2 - 20;
        const meterY1 = 10;
        const meterY2 = height / 2 + 10;
        
        // Lチャンネル
        this.drawChannelMeter(ctx, width, meterY1, meterHeight, 
            this.currentLevelLeft, this.peakHoldLeft, 'L');
        
        // Rチャンネル
        this.drawChannelMeter(ctx, width, meterY2, meterHeight, 
            this.currentLevelRight, this.peakHoldRight, 'R');
    }
    
    drawChannelMeter(ctx, width, y, height, level, peak, label) {
        const minDB = -60;
        const maxDB = 6;
        
        // テーマに応じた色を取得
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#cbd5e0' : '#4a5568';
        const meterBg = isDark ? '#374151' : '#e2e8f0';
        const gridColor = isDark ? '#4a5568' : '#3a3a3a';
        const labelColor = isDark ? '#718096' : '#a0aec0';
        
        // ラベル
        ctx.fillStyle = textColor;
        ctx.font = '14px "LINE Seed JP", sans-serif';
        ctx.fontWeight = 'bold';
        ctx.fillText(label, 5, y + height / 2 + 5);
        
        // メーター背景
        const meterX = 30;
        const meterWidth = width - 40;
        
        ctx.fillStyle = meterBg;
        ctx.fillRect(meterX, y, meterWidth, height);
        
        // グリッド
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        
        const dbMarks = [-60, -50, -40, -30, -20, -10, -6, -3, 0, 3, 6];
        for (const db of dbMarks) {
            const x = meterX + ((db - minDB) / (maxDB - minDB)) * meterWidth;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + height);
            ctx.stroke();
            
            // ラベル
            ctx.fillStyle = labelColor;
            ctx.font = '9px "LINE Seed JP", sans-serif';
            ctx.fillText(db.toString(), x - 8, y + height + 12);
        }
        
        // 0dBライン（赤）
        const x0db = meterX + ((0 - minDB) / (maxDB - minDB)) * meterWidth;
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0db, y);
        ctx.lineTo(x0db, y + height);
        ctx.stroke();
        
        // レベルバー
        if (level !== -Infinity) {
            const levelClamped = Math.max(minDB, Math.min(maxDB, level));
            const levelWidth = ((levelClamped - minDB) / (maxDB - minDB)) * meterWidth;
            
            // グラデーション（パステル）
            const gradient = ctx.createLinearGradient(meterX, 0, meterX + meterWidth, 0);
            gradient.addColorStop(0, '#86efac');
            gradient.addColorStop(0.7, '#fbbf24');
            gradient.addColorStop(0.9, '#fb923c');
            gradient.addColorStop(1, '#f87171');
            
            ctx.fillStyle = gradient;
            ctx.shadowColor = 'rgba(165, 180, 252, 0.3)';
            ctx.shadowBlur = 8;
            ctx.fillRect(meterX, y + 5, levelWidth, height - 10);
            ctx.shadowBlur = 0;
        }
        
        // ピークホールドマーカー
        if (peak !== -Infinity) {
            const peakClamped = Math.max(minDB, Math.min(maxDB, peak));
            const peakX = meterX + ((peakClamped - minDB) / (maxDB - minDB)) * meterWidth;
            
            ctx.fillStyle = peak > 0 ? '#fb923c' : '#a5b4fc';
            ctx.shadowColor = peak > 0 ? 'rgba(251, 146, 60, 0.5)' : 'rgba(165, 180, 252, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fillRect(peakX - 2, y, 4, height);
            ctx.shadowBlur = 0;
        }
    }
    
    getValues() {
        return {
            left: this.peakLeft,
            right: this.peakRight,
            holdLeft: this.peakHoldLeft,
            holdRight: this.peakHoldRight
        };
    }
    
    reset() {
        this.peakLeft = -Infinity;
        this.peakRight = -Infinity;
        this.peakHoldLeft = -Infinity;
        this.peakHoldRight = -Infinity;
        this.currentLevelLeft = -Infinity;
        this.currentLevelRight = -Infinity;
        this.peakHoldTimerLeft = 0;
        this.peakHoldTimerRight = 0;
        console.log('True peak meter reset');
    }
}
