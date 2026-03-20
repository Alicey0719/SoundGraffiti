/**
 * LUFS Meter - ITU-R BS.1770-4 / EBU R128準拠
 * Integrated, Short-term, Momentary Loudness測定
 */

class LUFSMeter {
    constructor(canvasId, targetLufs = -23) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.targetLufs = targetLufs; // 基準値（デフォルト: -23 LUFS）
        
        // Canvas解像度設定
        this.setupCanvas();
        
        // K-weightingフィルター用の状態変数
        this.preFilterX = { left: [0, 0], right: [0, 0] };  // Pre-filter入力履歴
        this.preFilterY = { left: [0, 0], right: [0, 0] };  // Pre-filter出力履歴
        this.rlbFilterX = { left: [0, 0], right: [0, 0] };  // RLB filter入力履歴
        this.rlbFilterY = { left: [0, 0], right: [0, 0] };  // RLB filter出力履歴
        
        // ゲート用のブロック履歴（400ms blocks）
        this.blockHistory = [];
        this.maxBlocks = 750; // 約300秒分
        
        // 測定値
        this.values = {
            momentary: -Infinity,    // 400ms
            shortterm: -Infinity,    // 3s
            integrated: -Infinity,   // 全体
            lra: 0                   // Loudness Range
        };
        
        // 時間管理
        this.sampleRate = 48000;
        this.blockSize = 0.1; // 100ms (簡易実装: オーバーラップなし)
        this.samplesPerBlock = 0;
        this.currentBlockSamples = { left: [], right: [] };
        
        // 表示用
        this.meterHistory = [];
        this.maxHistory = 100;
        
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
        // 初期描画
        this.draw();
    }
    
    update(audioData) {
        this.sampleRate = audioData.sampleRate;
        this.samplesPerBlock = Math.floor(this.sampleRate * this.blockSize);
        
        const leftChannel = audioData.leftChannel;
        const rightChannel = audioData.rightChannel;
        
        // K-weightingフィルター適用
        const filteredLeft = this.applyKWeighting(leftChannel, 'left');
        const filteredRight = this.applyKWeighting(rightChannel, 'right');
        
        // ブロック単位で処理
        for (let i = 0; i < leftChannel.length; i++) {
            this.currentBlockSamples.left.push(filteredLeft[i]);
            this.currentBlockSamples.right.push(filteredRight[i]);
            
            if (this.currentBlockSamples.left.length >= this.samplesPerBlock) {
                this.processBlock();
            }
        }
        
        this.draw();
    }
    
    // K-weightingフィルター（Pre-filter + RLB filter）
    applyKWeighting(samples, channel) {
        const filtered = new Float32Array(samples.length);
        
        // Pre-filter (high-pass) - ITU-R BS.1770-4
        const b0_pre = 1.53512485958697;
        const b1_pre = -2.69169618940638;
        const b2_pre = 1.19839281085285;
        const a1_pre = -1.69065929318241;
        const a2_pre = 0.73248077421585;
        
        // RLB filter (high-shelf) - ITU-R BS.1770-4
        const b0_rlb = 1.0;
        const b1_rlb = -2.0;
        const b2_rlb = 1.0;
        const a1_rlb = -1.99004745483398;
        const a2_rlb = 0.99007225036621;
        
        for (let i = 0; i < samples.length; i++) {
            // Pre-filter適用
            const x = samples[i];
            const y_pre = b0_pre * x + 
                         b1_pre * this.preFilterX[channel][0] + 
                         b2_pre * this.preFilterX[channel][1] -
                         a1_pre * this.preFilterY[channel][0] - 
                         a2_pre * this.preFilterY[channel][1];
            
            // Pre-filter状態更新
            this.preFilterX[channel][1] = this.preFilterX[channel][0];
            this.preFilterX[channel][0] = x;
            this.preFilterY[channel][1] = this.preFilterY[channel][0];
            this.preFilterY[channel][0] = y_pre;
            
            // RLB filter適用
            const y = b0_rlb * y_pre + 
                     b1_rlb * this.rlbFilterX[channel][0] + 
                     b2_rlb * this.rlbFilterX[channel][1] -
                     a1_rlb * this.rlbFilterY[channel][0] - 
                     a2_rlb * this.rlbFilterY[channel][1];
            
            // RLB filter状態更新
            this.rlbFilterX[channel][1] = this.rlbFilterX[channel][0];
            this.rlbFilterX[channel][0] = y_pre;
            this.rlbFilterY[channel][1] = this.rlbFilterY[channel][0];
            this.rlbFilterY[channel][0] = y;
            
            filtered[i] = y;
        }
        
        return filtered;
    }
    
    processBlock() {
        // Mean square計算（L: +0dB, R: +0dB weight）
        const msLeft = this.meanSquare(this.currentBlockSamples.left);
        const msRight = this.meanSquare(this.currentBlockSamples.right);
        
        // Channel weighting (L: 1.0, R: 1.0 for stereo)
        const loudness = -0.691 + 10 * Math.log10(msLeft + msRight);
        
        // ブロック履歴に追加
        this.blockHistory.push(loudness);
        if (this.blockHistory.length > this.maxBlocks) {
            this.blockHistory.shift();
        }
        
        // Momentary loudness (400ms = 4 blocks)
        this.values.momentary = this.calculateMomentary();
        
        // Short-term loudness (3s = 30 blocks)
        this.values.shortterm = this.calculateShortTerm();
        
        // Integrated loudness (gated)
        this.values.integrated = this.calculateIntegrated();
        
        // LRA (Loudness Range)
        this.values.lra = this.calculateLRA();
        
        // ヒストリーに追加
        this.meterHistory.push({
            momentary: this.values.momentary,
            shortterm: this.values.shortterm,
            integrated: this.values.integrated
        });
        
        if (this.meterHistory.length > this.maxHistory) {
            this.meterHistory.shift();
        }
        
        // ブロックバッファをクリア
        this.currentBlockSamples = { left: [], right: [] };
    }
    
    meanSquare(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return sum / samples.length;
    }
    
    calculateMomentary() {
        if (this.blockHistory.length < 4) return -Infinity;
        
        const blocks = this.blockHistory.slice(-4);
        let sum = 0;
        for (const block of blocks) {
            sum += Math.pow(10, block / 10);
        }
        return -0.691 + 10 * Math.log10(sum / blocks.length);
    }
    
    calculateShortTerm() {
        if (this.blockHistory.length < 30) return -Infinity;
        
        const blocks = this.blockHistory.slice(-30);
        let sum = 0;
        for (const block of blocks) {
            sum += Math.pow(10, block / 10);
        }
        return -0.691 + 10 * Math.log10(sum / blocks.length);
    }
    
    calculateIntegrated() {
        if (this.blockHistory.length < 4) return -Infinity;
        
        // Absolute gate (-70 LUFS)
        const absoluteGate = -70;
        const gated1 = this.blockHistory.filter(l => l > absoluteGate);
        
        if (gated1.length === 0) return -Infinity;
        
        // Relative gate (-10 LU below mean)
        let sum = 0;
        for (const block of gated1) {
            sum += Math.pow(10, block / 10);
        }
        const mean = -0.691 + 10 * Math.log10(sum / gated1.length);
        const relativeGate = mean - 10;
        
        const gated2 = gated1.filter(l => l > relativeGate);
        
        if (gated2.length === 0) return -Infinity;
        
        sum = 0;
        for (const block of gated2) {
            sum += Math.pow(10, block / 10);
        }
        
        return -0.691 + 10 * Math.log10(sum / gated2.length);
    }
    
    calculateLRA() {
        if (this.blockHistory.length < 30) return 0;
        
        // Short-term loudness values
        const shortTermValues = [];
        for (let i = 29; i < this.blockHistory.length; i++) {
            const blocks = this.blockHistory.slice(i - 29, i + 1);
            let sum = 0;
            for (const block of blocks) {
                sum += Math.pow(10, block / 10);
            }
            const stl = -0.691 + 10 * Math.log10(sum / blocks.length);
            if (stl > -70) {
                shortTermValues.push(stl);
            }
        }
        
        if (shortTermValues.length < 2) return 0;
        
        // Sort and calculate 10th and 95th percentiles
        shortTermValues.sort((a, b) => a - b);
        const low = shortTermValues[Math.floor(shortTermValues.length * 0.1)];
        const high = shortTermValues[Math.floor(shortTermValues.length * 0.95)];
        
        return high - low;
    }
    
    draw() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        
        // テーマに応じた背景色を取得
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const bgColor1 = isDark ? '#2d3748' : '#f7fafc';
        const bgColor2 = isDark ? '#1a202c' : '#edf2f7';
        const gridColor = isDark ? '#4a5568' : '#cbd5e0';
        const textColor = isDark ? '#cbd5e0' : '#a0aec0';
        
        // 背景（パステルグラデーション）
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, bgColor1);
        gradient.addColorStop(1, bgColor2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // グリッド
        this.drawGrid(ctx, width, height, gridColor, textColor);
        
        // メーター描画
        this.drawMeter(ctx, width, height);
    }
    
    drawGrid(ctx, width, height, gridColor = '#cbd5e0', textColor = '#a0aec0') {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '10px "LINE Seed JP", sans-serif';
        ctx.fillStyle = textColor;
        
        // 描画マージン
        const margin = 8;
        const drawHeight = height - margin * 2;
        
        // 横線とラベル（LUFS値）
        const lufsValues = [-60, -50, -40, -30, -23, -20, -10, 0];
        const minLUFS = -60;
        const maxLUFS = 0;
        
        for (const lufs of lufsValues) {
            const y = margin + drawHeight - ((lufs - minLUFS) / (maxLUFS - minLUFS)) * drawHeight;
            
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            ctx.fillText(`${lufs} LUFS`, 5, y - 3);
        }
        
        // ターゲットLUFS基準線
        const yTarget = margin + drawHeight - ((this.targetLufs - minLUFS) / (maxLUFS - minLUFS)) * drawHeight;
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, yTarget);
        ctx.lineTo(width, yTarget);
        ctx.stroke();
    }
    
    drawMeter(ctx, width, height) {
        const minLUFS = -60;
        const maxLUFS = 0;
        
        // 描画マージン
        const margin = 8;
        const drawHeight = height - margin * 2;
        
        // マーカーの左からの位置（ラベルと重ならないように）
        const markerX1 = 90;  // Integrated (緑)
        const markerX2 = 120; // Short-term (黄)
        const markerX3 = 150; // Momentary (オレンジ)
        
        // Integrated
        if (this.values.integrated !== -Infinity) {
            const normalizedY = (this.values.integrated - minLUFS) / (maxLUFS - minLUFS);
            const y = Math.max(margin + 3, Math.min(height - margin - 3, margin + drawHeight - normalizedY * drawHeight));
            ctx.fillStyle = '#86efac';
            ctx.shadowColor = 'rgba(134, 239, 172, 0.4)';
            ctx.shadowBlur = 8;
            ctx.fillRect(markerX1, y - 3, 20, 6);
            ctx.shadowBlur = 0;
        }
        
        // Short-term
        if (this.values.shortterm !== -Infinity) {
            const normalizedY = (this.values.shortterm - minLUFS) / (maxLUFS - minLUFS);
            const y = Math.max(margin + 3, Math.min(height - margin - 3, margin + drawHeight - normalizedY * drawHeight));
            ctx.fillStyle = '#fbbf24';
            ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
            ctx.shadowBlur = 8;
            ctx.fillRect(markerX2, y - 3, 20, 6);
            ctx.shadowBlur = 0;
        }
        
        // Momentary
        if (this.values.momentary !== -Infinity) {
            const normalizedY = (this.values.momentary - minLUFS) / (maxLUFS - minLUFS);
            const y = Math.max(margin + 3, Math.min(height - margin - 3, margin + drawHeight - normalizedY * drawHeight));
            ctx.fillStyle = '#fb923c';
            ctx.shadowColor = 'rgba(251, 146, 60, 0.4)';
            ctx.shadowBlur = 8;
            ctx.fillRect(markerX3, y - 3, 20, 6);
            ctx.shadowBlur = 0;
        }
    }
    
    getValues() {
        return this.values;
    }
    
    reset() {
        // フィルターをリセット
        this.preFilterX = { left: [0, 0], right: [0, 0] };
        this.preFilterY = { left: [0, 0], right: [0, 0] };
        this.rlbFilterX = { left: [0, 0], right: [0, 0] };
        this.rlbFilterY = { left: [0, 0], right: [0, 0] };
        
        // ブロック履歴をクリア
        this.blockHistory = [];
        
        // 測定値をリセット
        this.values = {
            momentary: -Infinity,
            shortterm: -Infinity,
            integrated: -Infinity,
            lra: 0
        };
        
        // バッファをクリア
        this.currentBlockSamples = { left: [], right: [] };
        this.meterHistory = [];
        
        console.log('LUFS meter reset');
    }
}
