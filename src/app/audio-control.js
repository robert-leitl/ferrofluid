import { clamp, mapRange } from "./utils";

export class AudioControl {

    isInitialized = false;

    FFT_BUFFER_SIZE = 2048;
    MAX_FREQ = 2400; // the maximum input frequency which result in a control value of 1
    MIN_FREQ = 400; // the minimum input frequency which result in a control value of 0

    VISUALIZER_WIDTH = 200;
    VISUALIZER_HEIGHT = 100;
    
    constructor(isDev = false) {

        this.isDev = isDev;

        if (isDev) {
            this.visualizerElm = document.createElement('canvas');
            this.visualizerElm.width = this.VISUALIZER_WIDTH;
            this.visualizerElm.height = this.VISUALIZER_HEIGHT;
            this.visualizerElm.style.position = 'absolute';
            this.visualizerElm.style.top = '20px';
            this.visualizerElm.style.left = 0;
            this.visualizerElm.style.width = `${this.VISUALIZER_WIDTH}px`;
            this.visualizerElm.style.height = `${this.VISUALIZER_HEIGHT}px`;
            this.visualizerElm.style.zIndex = 10;
            this.visualizerCtx = this.visualizerElm.getContext('2d');
            document.body.appendChild(this.visualizerElm);
        }
    }

    init() {
        this.audioContext = new AudioContext();

        navigator.mediaDevices.getUserMedia(
        {
            audio: {
                mandatory: {
                    googEchoCancellation: false,
                    googAutoGainControl: false,
                    googNoiseSuppression: false,
                    googHighpassFilter: false
                },
                optional: []
            },
        }).then((stream) => {
            this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.FFT_BUFFER_SIZE;
            this.analyser.minDecibels = -90;

            this.bufferLength = this.analyser.frequencyBinCount;
            this.buffer = new Uint8Array(this.bufferLength);
            this.mediaStreamSource.connect( this.analyser );

            // calculate the frequency bin bandwidth
            this.freqBandwidth = (this.audioContext.sampleRate / 2) / this.bufferLength;

            this.isInitialized = true;
        }).catch((err) => {
            console.error(`Could not initialize user media device: ${err.name}: ${err.message}`);
        });
    }

    getValue() {
        if (this.isInitialized) {
            this.analyser.getByteFrequencyData( this.buffer );

            if (this.isDev) this.visualize();

            // find the frequency band index with the maximum value
            const maxLevelIndex = this.buffer.reduce((max, value, index) => value > max.value ? { value, index } : max, {value: 0, index: 0}).index;
            let frequency = maxLevelIndex * this.freqBandwidth;

            if (frequency > 0) {
                // make logarithmic range to appeare more natural in respect to musical notes
                let result = mapRange(Math.log2(frequency), Math.log2(this.MIN_FREQ), Math.log2(this.MAX_FREQ), 0, 1);
                result = result * 2 - 1;
                
                return clamp(result, -1, 1);
            }
        }
        return -1;
    }

    visualize() {
        this.visualizerCtx.fillStyle = 'rgb(0, 0, 0)';
        this.visualizerCtx.fillRect(0, 0, this.VISUALIZER_WIDTH, this.VISUALIZER_HEIGHT);

        const barWidth = (this.VISUALIZER_WIDTH / this.bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < this.bufferLength; i++) {
            barHeight = this.buffer[i];

            this.visualizerCtx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
            this.visualizerCtx.fillRect(x, this.VISUALIZER_HEIGHT - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth + 1;
        }
    }
}