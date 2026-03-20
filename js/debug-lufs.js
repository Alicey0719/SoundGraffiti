/**
 * LUFS Calculation Debug Tool
 * 実際の音声データでLUFS計算をテストするツール
 */

// デバッグモードを有効にする関数
function enableLUFSDebug() {
    console.log('%c=== LUFS Debug Mode Enabled ===', 'color: #86efac; font-weight: bold; font-size: 14px;');
    
    // オリジナルのprocessBlock関数をラップ
    if (window.app && window.app.meters && window.app.meters.lufs) {
        const meter = window.app.meters.lufs;
        const originalProcessBlock = meter.processBlock.bind(meter);
        
        let blockCount = 0;
        
        meter.processBlock = function() {
            blockCount++;
            
            // サンプル統計を収集
            const leftSamples = this.currentBlockSamples.left;
            const rightSamples = this.currentBlockSamples.right;
            
            if (leftSamples.length > 0 && blockCount % 10 === 0) { // 10ブロックごとにログ
                // 統計計算
                const stats = {
                    left: getSampleStats(leftSamples),
                    right: getSampleStats(rightSamples)
                };
                
                console.group(`📊 Block #${blockCount} (${leftSamples.length} samples)`);
                console.log('Left Channel:', stats.left);
                console.log('Right Channel:', stats.right);
                
                // Mean square計算
                const msLeft = this.meanSquare(leftSamples);
                const msRight = this.meanSquare(rightSamples);
                console.log('Mean Square L:', msLeft.toExponential(6));
                console.log('Mean Square R:', msRight.toExponential(6));
                
                // Block loudness計算
                const blockLoudness = -0.691 + 10 * Math.log10(msLeft + msRight);
                console.log('Block Loudness:', blockLoudness.toFixed(2), 'LUFS');
                
                // 現在の測定値
                console.log('Current Values:', {
                    momentary: this.values.momentary.toFixed(2) + ' LUFS',
                    shortterm: this.values.shortterm.toFixed(2) + ' LUFS',
                    integrated: this.values.integrated.toFixed(2) + ' LUFS',
                    lra: this.values.lra.toFixed(2) + ' LU'
                });
                
                console.groupEnd();
            }
            
            // オリジナルの処理を実行
            return originalProcessBlock.call(this);
        };
        
        console.log('✅ ProcessBlock hooked successfully');
        console.log('💡 LUFS values will be logged every 10 blocks (1 second)');
    }
    
    // K-weightingフィルターのテスト
    console.group('🔍 K-weighting Filter Test');
    testKWeightingWithSignal();
    console.groupEnd();
}

function getSampleStats(samples) {
    const arr = Array.from(samples);
    arr.sort((a, b) => a - b);
    
    const min = arr[0];
    const max = arr[arr.length - 1];
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    
    let sumSq = 0;
    for (let i = 0; i < arr.length; i++) {
        const diff = arr[i] - mean;
        sumSq += diff * diff;
    }
    const std = Math.sqrt(sumSq / arr.length);
    
    const rms = Math.sqrt(arr.reduce((a, b) => a + b * b, 0) / arr.length);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    
    return {
        min: min.toFixed(6),
        max: max.toFixed(6),
        mean: mean.toFixed(6),
        std: std.toFixed(6),
        rms: rms.toFixed(6),
        rmsDb: rmsDb.toFixed(2) + ' dB',
        clipping: (Math.abs(min) > 1.0 || Math.abs(max) > 1.0) ? '⚠️ YES' : 'No'
    };
}

function testKWeightingWithSignal() {
    // 1kHz サイン波でK-weightingをテスト
    const sampleRate = 48000;
    const duration = 0.1; // 100ms
    const samples = Math.floor(sampleRate * duration);
    const frequency = 1000;
    const amplitude = 0.1; // -20 dBFS
    
    const testSignal = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        testSignal[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }
    
    console.log('Input Signal:', {
        frequency: frequency + ' Hz',
        amplitude: amplitude,
        dBFS: (20 * Math.log10(amplitude)).toFixed(2) + ' dB',
        samples: samples
    });
    
    // フィルター無しのRMS
    const inputRMS = Math.sqrt(testSignal.reduce((a, b) => a + b * b, 0) / testSignal.length);
    const inputDb = 20 * Math.log10(inputRMS);
    
    console.log('Input RMS:', inputRMS.toFixed(6), '(' + inputDb.toFixed(2) + ' dB)');
    
    // Note: 実際のK-weightingフィルターを適用するには、LUFSMeterインスタンスが必要
    console.log('💡 To test K-weighting with actual meter, start monitoring first');
}

// コンソールから呼び出せるようにグローバルに登録
window.enableLUFSDebug = enableLUFSDebug;

console.log('%cLUFS Debug Tool Loaded!', 'color: #a5b4fc; font-size: 12px;');
console.log('Run: %cenableLUFSDebug()', 'color: #86efac; font-weight: bold;');
console.log('Then start monitoring to see detailed LUFS calculations');
