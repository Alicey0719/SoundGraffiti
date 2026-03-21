/**
 * Audio Worklet Processor
 * オーディオ処理を別スレッドで実行してメインスレッドの負荷を軽減
 */

class SoundGraffitiProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // バッファサイズ（メインスレッドに送信する単位）
        this.targetBufferSize = 4096;
        
        // サンプルバッファ
        this.leftBuffer = [];
        this.rightBuffer = [];
        
        // サンプルカウンター
        this.sampleCount = 0;
    }
    
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        
        // 入力がない場合はスキップ
        if (!input || input.length < 2) {
            return true;
        }
        
        const leftChannel = input[0];
        const rightChannel = input[1];
        const frameSize = leftChannel.length;
        
        // 出力にコピー（パススルー、gainNodeで音量制御）
        if (output && output.length >= 2) {
            output[0].set(leftChannel);
            output[1].set(rightChannel);
        }
        
        // サンプルをバッファに追加
        for (let i = 0; i < frameSize; i++) {
            this.leftBuffer.push(leftChannel[i]);
            this.rightBuffer.push(rightChannel[i]);
        }
        
        this.sampleCount += frameSize;
        
        // 目標バッファサイズに達したらメインスレッドに送信
        if (this.leftBuffer.length >= this.targetBufferSize) {
            // Float32Arrayに変換して送信（transferableオブジェクト対応）
            const leftData = new Float32Array(this.leftBuffer);
            const rightData = new Float32Array(this.rightBuffer);
            
            this.port.postMessage({
                leftChannel: leftData,
                rightChannel: rightData,
                sampleCount: this.sampleCount
            }, [leftData.buffer, rightData.buffer]); // Transferable objects
            
            // バッファをクリア
            this.leftBuffer = [];
            this.rightBuffer = [];
        }
        
        // trueを返すことでprocessorを維持
        return true;
    }
}

// ProcessorRegistration
registerProcessor('sound-graffiti-processor', SoundGraffitiProcessor);
