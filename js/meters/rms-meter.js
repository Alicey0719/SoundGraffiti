/**
 * RMS Meter - RMSレベルメーター
 * リニアなRMS値を表示
 */

class RMSMeter {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.setupCanvas();
        
        // RMS値
        this.rmsLeft = -Infinity;
        this.rmsRight = -Infinity;
        
        // ピークホールド
        this.peakHoldLeft = -Infinity;
        this.peakHoldRight = -Infinity;
        this.peakHoldTime = 2000; // 2秒
        this.peakHoldTimerLeft = 0;
        this.peakHoldTimerRight = 0;
        
        // 現在レベル（表示用）
        this.currentLevelLeft = -Infinity;
        this.currentLevelRight = -Infinity;
        
        // RMS計算用バッファ履歴（300ms分を保持して移動平均）
        this.bufferHistory = {
            left: [],
            right: [],
            maxBuffers: 4 // 4096 samples * 4 = 約340ms @ 48kHz
        };
        
        // 表示用キャッシュ
        this.cachedGradients = null;
        this.cachedTheme = null;
        
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
        
        // バッファ履歴に追加
        this.bufferHistory.left.push(leftChannel);
        this.bufferHistory.right.push(rightChannel);
        
        // 古いバッファを削除
        if (this.bufferHistory.left.length > this.bufferHistory.maxBuffers) {
            this.bufferHistory.left.shift();
        }
        if (this.bufferHistory.right.length > this.bufferHistory.maxBuffers) {
            this.bufferHistory.right.shift();
        }
        
        // 履歴全体でのRMS計算（300ms移動平均）
        const rmsLeft = this.calculateRMSFromHistory(this.bufferHistory.left);
        const rmsRight = this.calculateRMSFromHistory(this.bufferHistory.right);
        
        // dB変換
        const dbLeft = rmsLeft > 0 ? 20 * Math.log10(rmsLeft) : -Infinity;
        const dbRight = rmsRight > 0 ? 20 * Math.log10(rmsRight) : -Infinity;
        
        const now = Date.now();
        
        // RMS値更新
        this.rmsLeft = dbLeft;
        this.rmsRight = dbRight;
        
        // 表示用レベル
        this.currentLevelLeft = dbLeft;
        this.currentLevelRight = dbRight;
        
        // ピーク更新
        if (this.currentLevelLeft > this.peakHoldLeft) {
            this.peakHoldLeft = this.currentLevelLeft;
            this.peakHoldTimerLeft = now;
        } else if (now - this.peakHoldTimerLeft > this.peakHoldTime) {
            // タイムアウト後は現在レベルを追従
            this.peakHoldLeft = this.currentLevelLeft;
        }
        
        if (this.currentLevelRight > this.peakHoldRight) {
            this.peakHoldRight = this.currentLevelRight;
            this.peakHoldTimerRight = now;
        } else if (now - this.peakHoldTimerRight > this.peakHoldTime) {
            // タイムアウト後は現在レベルを追従
            this.peakHoldRight = this.currentLevelRight;
        }
        
        this.lastUpdateTime = now;
    }
    
    calculateRMSFromHistory(bufferHistory) {
        if (bufferHistory.length === 0) return 0;
        
        let sum = 0;
        let totalSamples = 0;
        
        // 全バッファにわたってRMS計算
        for (const buffer of bufferHistory) {
            for (let i = 0; i < buffer.length; i++) {
                sum += buffer[i] * buffer[i];
            }
            totalSamples += buffer.length;
        }
        
        return Math.sqrt(sum / totalSamples);
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
        
        // テーマ変更チェック（キャッシュ活用）
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme !== this.cachedTheme) {
            this.cachedTheme = currentTheme;
            this.cachedGradients = null; // グラデーションキャッシュをクリア
        }
        
        const isDark = currentTheme === 'dark';
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
            this.currentLevelLeft, this.peakHoldLeft, 'L', isDark);
        
        // Rチャンネル
        this.drawChannelMeter(ctx, width, meterY2, meterHeight, 
            this.currentLevelRight, this.peakHoldRight, 'R', isDark);
    }
    
    drawChannelMeter(ctx, width, y, height, level, peak, label, isDark) {
        const minDB = -60;
        const maxDB = 0;
        
        // テーマに応じた色
        const textColor = isDark ? '#cbd5e0' : '#4a5568';
        const meterBg = isDark ? '#374151' : '#e2e8f0';
        const gridColor = isDark ? '#4a5568' : '#cbd5e0';
        const labelColor = isDark ? '#718096' : '#a0aec0';
        
        // ラベル
        ctx.fillStyle = textColor;
        ctx.font = 'bold 14px "LINE Seed JP", sans-serif';
        ctx.fillText(label, 5, y + height / 2 + 5);
        
        // メーター背景
        const meterX = 30;
        const meterWidth = width - 40;
        
        ctx.fillStyle = meterBg;
        ctx.fillRect(meterX, y, meterWidth, height);
        
        // グリッド
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        
        const dbMarks = [-60, -50, -40, -30, -20, -18, -12, -6, -3, 0];
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
        
        // -18dBライン（VU 0 参照ライン）
        const x18db = meterX + ((-18 - minDB) / (maxDB - minDB)) * meterWidth;
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x18db, y);
        ctx.lineTo(x18db, y + height);
        ctx.stroke();
        
        // 0dBライン（赤）
        const x0db = meterX + ((0 - minDB) / (maxDB - minDB)) * meterWidth;
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0db, y);
        ctx.lineTo(x0db, y + height);
        ctx.stroke();
        
        // レベルバー
        if (level !== -Infinity && !isNaN(level)) {
            const levelClamped = Math.max(minDB, Math.min(maxDB, level));
            const levelWidth = ((levelClamped - minDB) / (maxDB - minDB)) * meterWidth;
            
            // グラデーションキャッシュ
            if (!this.cachedGradients) {
                const gradient = ctx.createLinearGradient(meterX, 0, meterX + meterWidth, 0);
                gradient.addColorStop(0, '#86efac');
                gradient.addColorStop(0.6, '#fde047');
                gradient.addColorStop(0.85, '#fbbf24');
                gradient.addColorStop(0.95, '#fb923c');
                gradient.addColorStop(1, '#f87171');
                this.cachedGradients = gradient;
            }
            
            ctx.fillStyle = this.cachedGradients;
            ctx.shadowColor = 'rgba(165, 180, 252, 0.3)';
            ctx.shadowBlur = 8;
            ctx.fillRect(meterX, y + 5, levelWidth, height - 10);
            ctx.shadowBlur = 0;
        }
        
        // ピークホールドマーカー
        if (peak !== -Infinity && !isNaN(peak)) {
            const peakClamped = Math.max(minDB, Math.min(maxDB, peak));
            const peakX = meterX + ((peakClamped - minDB) / (maxDB - minDB)) * meterWidth;
            
            ctx.fillStyle = peak > -3 ? '#fb923c' : '#a5b4fc';
            ctx.shadowColor = peak > -3 ? 'rgba(251, 146, 60, 0.5)' : 'rgba(165, 180, 252, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fillRect(peakX - 2, y, 4, height);
            ctx.shadowBlur = 0;
        }
    }
    
    getValues() {
        return {
            left: this.peakHoldLeft,
            right: this.peakHoldRight,
            peakLeft: this.peakHoldLeft,
            peakRight: this.peakHoldRight
        };
    }
    
    reset() {
        this.rmsLeft = -Infinity;
        this.rmsRight = -Infinity;
        this.peakHoldLeft = -Infinity;
        this.peakHoldRight = -Infinity;
        this.currentLevelLeft = -Infinity;
        this.currentLevelRight = -Infinity;
        this.peakHoldTimerLeft = 0;
        this.peakHoldTimerRight = 0;
        this.bufferHistory.left = [];
        this.bufferHistory.right = [];
        this.cachedGradients = null;
        console.log('RMS meter reset');
    }
}
