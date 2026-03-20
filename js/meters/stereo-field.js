/**
 * Stereo Field (Phase Correlation Meter)
 * ステレオイメージの可視化
 */

class StereoField {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.setupCanvas();
        
        // ステレオ位置データ
        this.positions = [];
        this.maxPositions = 500;
        
        // 相関メーター
        this.correlation = 0;
        this.correlationHistory = [];
        
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
        const leftChannel = audioData.leftChannel;
        const rightChannel = audioData.rightChannel;
        
        // ステレオ位置の計算
        const decimation = 10; // 間引き
        for (let i = 0; i < leftChannel.length; i += decimation) {
            const L = leftChannel[i];
            const R = rightChannel[i];
            
            // Mid-Side変換
            const mid = (L + R) / 2;
            const side = (L - R) / 2;
            
            this.positions.push({ x: side, y: mid });
        }
        
        // 古いデータを削除
        if (this.positions.length > this.maxPositions) {
            this.positions = this.positions.slice(-this.maxPositions);
        }
        
        // 相関係数の計算
        this.correlation = this.calculateCorrelation(leftChannel, rightChannel);
        this.correlationHistory.push(this.correlation);
        
        if (this.correlationHistory.length > 100) {
            this.correlationHistory.shift();
        }
    }
    
    calculateCorrelation(left, right) {
        let sumLR = 0;
        let sumL2 = 0;
        let sumR2 = 0;
        
        for (let i = 0; i < left.length; i++) {
            sumLR += left[i] * right[i];
            sumL2 += left[i] * left[i];
            sumR2 += right[i] * right[i];
        }
        
        const denom = Math.sqrt(sumL2 * sumR2);
        if (denom === 0) return 0;
        
        return sumLR / denom;
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
        
        // ステレオフィールド（左側）
        const fieldSize = Math.min(width * 0.5, height - 40);
        const fieldX = 20;
        const fieldY = (height - fieldSize) / 2;
        
        this.drawStereoField(ctx, fieldX, fieldY, fieldSize);
        
        // 相関メーター（右側）
        const meterX = fieldX + fieldSize + 40;
        const meterWidth = width - meterX - 20;
        const meterHeight = height - 40;
        
        this.drawCorrelationMeter(ctx, meterX, 20, meterWidth, meterHeight);
    }
    
    drawStereoField(ctx, x, y, size) {
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const radius = size / 2;
        
        // テーマに応じた色を取得
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? '#4a5568' : '#cbd5e0';
        const crossColor = isDark ? '#374151' : '#e2e8f0';
        const diagonalColor = isDark ? '#2d3748' : '#edf2f7';
        const textColor = isDark ? '#cbd5e0' : '#718096';
        
        // 外枠円
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // 十字線
        ctx.strokeStyle = crossColor;
        ctx.lineWidth = 2;
        
        // 縦線（Mid）
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX, y + size);
        ctx.stroke();
        
        // 横線（Side）
        ctx.beginPath();
        ctx.moveTo(x, centerY);
        ctx.lineTo(x + size, centerY);
        ctx.stroke();
        
        // 対角線（L/R）
        ctx.strokeStyle = diagonalColor;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y + size);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.stroke();
        
        // ラベル
        ctx.fillStyle = textColor;
        ctx.font = '12px "LINE Seed JP", sans-serif';
        ctx.fontWeight = 'bold';
        ctx.textAlign = 'center';
        
        ctx.fillText('M', centerX, y - 5);
        ctx.fillText('L', x - 10, centerY + 4);
        ctx.fillText('R', x + size + 15, centerY + 4);
        ctx.fillText('S', centerX, y + size + 15);
        
        // ステレオ位置プロット
        for (const pos of this.positions) {
            const px = centerX + pos.x * radius * 2;
            const py = centerY - pos.y * radius * 2;
            
            const posGradient = ctx.createRadialGradient(px, py, 0, px, py, 3);
            posGradient.addColorStop(0, 'rgba(165, 180, 252, 0.6)');
            posGradient.addColorStop(1, 'rgba(165, 180, 252, 0.1)');
            ctx.fillStyle = posGradient;
            
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 中心点
        ctx.fillStyle = '#a5b4fc';
        ctx.shadowColor = 'rgba(165, 180, 252, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    drawCorrelationMeter(ctx, x, y, width, height) {
        // テーマに応じた色を取得
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#cbd5e0' : '#4a5568';
        const meterBg = isDark ? '#374151' : '#e2e8f0';
        const gridColor = isDark ? '#4a5568' : '#cbd5e0';
        const labelColor = isDark ? '#718096' : '#a0aec0';
        
        // タイトル
        ctx.fillStyle = textColor;
        ctx.font = '13px "LINE Seed JP", sans-serif';
        ctx.fontWeight = 'bold';
        ctx.textAlign = 'left';
        ctx.fillText('Phase Correlation', x + 5, y + 15);
        
        // メーター背景
        const meterY = y + 30;
        const meterHeight = height - 60;
        const meterWidth = Math.min(60, width - 10);
        const meterX = x + (width - meterWidth) / 2;
        
        ctx.fillStyle = meterBg;
        ctx.fillRect(meterX, meterY, meterWidth, meterHeight);
        
        // グリッド
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '10px "LINE Seed JP", sans-serif';
        ctx.textAlign = 'right';
        
        const corrValues = [1, 0.5, 0, -0.5, -1];
        for (const corr of corrValues) {
            const corrY = meterY + ((1 - corr) / 2) * meterHeight;
            
            ctx.beginPath();
            ctx.moveTo(meterX, corrY);
            ctx.lineTo(meterX + meterWidth, corrY);
            ctx.stroke();
            
            ctx.fillStyle = labelColor;
            ctx.fillText(corr.toFixed(1), meterX - 5, corrY + 4);
        }
        
        // 0線を強調
        const zeroY = meterY + meterHeight / 2;
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(meterX, zeroY);
        ctx.lineTo(meterX + meterWidth, zeroY);
        ctx.stroke();
        
        // 相関値バー
        const corrClamped = Math.max(-1, Math.min(1, this.correlation));
        const barY = meterY + ((1 - corrClamped) / 2) * meterHeight;
        
        // バーの色（正:緑、負:赤、0付近:黄）
        let barColor;
        if (corrClamped > 0.5) {
            barColor = '#86efac';
        } else if (corrClamped > 0) {
            barColor = '#fbbf24';
        } else if (corrClamped > -0.5) {
            barColor = '#fb923c';
        } else {
            barColor = '#f87171';
        }
        
        ctx.fillStyle = barColor;
        ctx.shadowColor = barColor;
        ctx.shadowBlur = 10;
        ctx.fillRect(meterX + 5, barY - 2, meterWidth - 10, 4);
        ctx.shadowBlur = 0;
        
        // 数値表示
        ctx.fillStyle = '#a5b4fc';
        ctx.font = '15px "LINE Seed JP", sans-serif';
        ctx.fontWeight = 'bold';
        ctx.textAlign = 'center';
        ctx.fillText(corrClamped.toFixed(3), meterX + meterWidth / 2, meterY + meterHeight + 20);
        
        // ヒストリーグラフ
        const histY = meterY + meterHeight + 40;
        const histHeight = height - (histY - y) - 10;
        
        if (histHeight > 20) {
            this.drawCorrelationHistory(ctx, x + 5, histY, width - 10, histHeight);
        }
    }
    
    drawCorrelationHistory(ctx, x, y, width, height) {
        // 背景
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(x, y, width, height);
        
        // 0線
        const zeroY = y + height / 2;
        ctx.strokeStyle = '#cbd5e0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, zeroY);
        ctx.lineTo(x + width, zeroY);
        ctx.stroke();
        
        // 履歴プロット
        if (this.correlationHistory.length > 1) {
            ctx.strokeStyle = '#a5b4fc';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = 'rgba(165, 180, 252, 0.3)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            
            for (let i = 0; i < this.correlationHistory.length; i++) {
                const corr = this.correlationHistory[i];
                const plotX = x + (i / this.correlationHistory.length) * width;
                const plotY = y + ((1 - corr) / 2) * height;
                
                if (i === 0) {
                    ctx.moveTo(plotX, plotY);
                } else {
                    ctx.lineTo(plotX, plotY);
                }
            }
            
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }
    
    reset() {
        this.positions = [];
        this.correlation = 0;
        this.correlationHistory = [];
        console.log('Stereo field reset');
    }
}
