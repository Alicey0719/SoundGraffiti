/**
 * VU Meter - アナログVUメーター風の表示
 * 300msの積分時間を持つRMSメーター
 */

class VUMeter {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.setupCanvas();
        
        // VU値（-20dB = 0VU）
        this.vuLeft = -60;
        this.vuRight = -60;
        
        // スムージング（VUメーター標準: 300ms積分時間）
        this.attackTime = 0.3; // 300ms（標準VUメーター仕様）
        this.releaseTime = 0.3; // 300ms
        this.smoothedLeft = -60;
        this.smoothedRight = -60;
        
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
        // RMS計算
        const rmsLeft = this.calculateRMS(audioData.leftChannel);
        const rmsRight = this.calculateRMS(audioData.rightChannel);
        
        // VU値計算（0 VU = -18 dBFS が標準）
        // dBFS = 20 * log10(rms)
        // VU = dBFS + 18 (つまり -18 dBFS が 0 VU)
        let vuLeft = rmsLeft > 0 ? 20 * Math.log10(rmsLeft) + 18 : -60;
        let vuRight = rmsRight > 0 ? 20 * Math.log10(rmsRight) + 18 : -60;
        
        // NaN/Infinityチェック
        if (!isFinite(vuLeft)) vuLeft = -60;
        if (!isFinite(vuRight)) vuRight = -60;
        
        // スムージング（VUメーター標準: 300ms積分時間）
        // 立ち上がりも立ち下がりも300msの時定数を使用
        const dt = audioData.bufferSize / audioData.sampleRate;
        
        if (vuLeft > this.smoothedLeft) {
            // アタック（300ms）
            const alpha = 1 - Math.exp(-dt / this.attackTime);
            this.smoothedLeft = this.smoothedLeft + alpha * (vuLeft - this.smoothedLeft);
        } else {
            // リリース（300ms）
            const alpha = 1 - Math.exp(-dt / this.releaseTime);
            this.smoothedLeft = this.smoothedLeft + alpha * (vuLeft - this.smoothedLeft);
        }
        
        if (vuRight > this.smoothedRight) {
            const alpha = 1 - Math.exp(-dt / this.attackTime);
            this.smoothedRight = this.smoothedRight + alpha * (vuRight - this.smoothedRight);
        } else {
            const alpha = 1 - Math.exp(-dt / this.releaseTime);
            this.smoothedRight = this.smoothedRight + alpha * (vuRight - this.smoothedRight);
        }
        
        // 最終値もNaNチェック
        this.vuLeft = isFinite(this.smoothedLeft) ? this.smoothedLeft : -60;
        this.vuRight = isFinite(this.smoothedRight) ? this.smoothedRight : -60;
    }
    
    calculateRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / samples.length);
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
        
        // 2つのアナログメーター風表示
        const meterWidth = width / 2 - 20;
        const meterHeight = height - 40;
        
        this.drawAnalogMeter(ctx, 10, 20, meterWidth, meterHeight, this.vuLeft, 'L');
        this.drawAnalogMeter(ctx, width / 2 + 10, 20, meterWidth, meterHeight, this.vuRight, 'R');
    }
    
    drawAnalogMeter(ctx, x, y, width, height, vu, label) {
        const centerX = x + width / 2;
        const centerY = y + height * 0.7;
        const radius = Math.min(width, height * 0.7) * 0.8;
        
        // テーマに応じた色を取得
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? '#4a5568' : '#cbd5e0';
        const textColor = isDark ? '#cbd5e0' : '#718096';
        
        // メーター外枠
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 0.25);
        ctx.stroke();
        
        // 目盛り（範囲を拡大: -20 to +6 VU）
        const minVU = -20;
        const maxVU = 6;
        const vuRange = maxVU - minVU;
        
        ctx.font = '10px "LINE Seed JP", sans-serif';
        ctx.textAlign = 'center';
        
        for (let i = minVU; i <= maxVU; i += 3) {
            const angle = Math.PI * 0.75 + ((i - minVU) / vuRange) * Math.PI * 1.5;
            const x1 = centerX + Math.cos(angle) * (radius - 10);
            const y1 = centerY + Math.sin(angle) * (radius - 10);
            const x2 = centerX + Math.cos(angle) * radius;
            const y2 = centerY + Math.sin(angle) * radius;
            
            ctx.strokeStyle = i === 0 ? '#a5b4fc' : gridColor;
            ctx.lineWidth = i === 0 ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            
            // ラベル
            const labelRadius = radius - 25;
            const labelX = centerX + Math.cos(angle) * labelRadius;
            const labelY = centerY + Math.sin(angle) * labelRadius;
            
            ctx.fillStyle = i === 0 ? '#a5b4fc' : textColor;
            ctx.fontWeight = i === 0 ? 'bold' : 'normal';
            if (i === 0) {
                ctx.fillText('0', labelX, labelY + 5);
            } else if (i === -20) {
                ctx.fillText('-20', labelX, labelY + 5);
            } else if (i === 3) {
                ctx.fillText('+3', labelX, labelY + 5);
            } else if (i === 6) {
                ctx.fillText('+6', labelX, labelY + 5);
            }
        }
        
        // 針の位置計算
        const vuClamped = Math.max(minVU, Math.min(maxVU, (vu > -60) ? vu : minVU));
        const needleAngle = Math.PI * 0.75 + ((vuClamped - minVU) / vuRange) * Math.PI * 1.5;
        const needleLength = radius - 5;
        
        // 針の色（レベルに応じて変化）
        let needleColor;
        if (vuClamped > 3) {
            needleColor = '#f87171'; // 赤（+3 VU超過）
        } else if (vuClamped > 0) {
            needleColor = '#fb923c'; // オレンジ（0〜+3 VU）
        } else {
            needleColor = '#86efac'; // 緑（0 VU以下）
        }
        
        // 針の描画
        ctx.strokeStyle = needleColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        
        // シャドウも針の色に合わせる
        if (vuClamped > 3) {
            ctx.shadowColor = 'rgba(248, 113, 113, 0.5)'; // 赤
        } else if (vuClamped > 0) {
            ctx.shadowColor = 'rgba(251, 146, 60, 0.5)'; // オレンジ
        } else {
            ctx.shadowColor = 'rgba(134, 239, 172, 0.5)'; // 緑
        }
        
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX + Math.cos(needleAngle) * needleLength,
            centerY + Math.sin(needleAngle) * needleLength
        );
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // 中心点
        ctx.fillStyle = '#a0aec0';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // チャンネルラベル
        ctx.fillStyle = '#4a5568';
        ctx.font = '18px "LINE Seed JP", sans-serif';
        ctx.fontWeight = 'bold';
        ctx.textAlign = 'center';
        ctx.fillText(label, centerX, y + height - 5);
        
        // VU値表示
        ctx.font = '12px "LINE Seed JP", sans-serif';
        ctx.fontWeight = 'bold';
        ctx.fillStyle = '#a5b4fc';
        if (vu !== -Infinity && vu > -60) {
            ctx.fillText(`${vu.toFixed(1)} VU`, centerX, y + height - 20);
        } else {
            ctx.fillText('-∞ VU', centerX, y + height - 20);
        }
    }
    
    getValues() {
        return {
            left: this.vuLeft,
            right: this.vuRight
        };
    }
    
    reset() {
        this.vuLeft = -60;
        this.vuRight = -60;
        this.smoothedLeft = -60;
        this.smoothedRight = -60;
        console.log('VU meter reset');
    }
}
