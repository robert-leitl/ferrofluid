export class PitchDetector {

    isInitialized = false;

    FFT_BUFFER_SIZE = 1024;
    
    constructor() {

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
            const bufferLength = this.analyser.frequencyBinCount;
            this.buffer = new Uint8Array(bufferLength);
            this.mediaStreamSource.connect( this.analyser );
            this.isInitialized = true;
            this.getPitch();
        }).catch((err) => {
            console.error(`${err.name}: ${err.message}`);
            alert('Stream generation failed.');
        });
    }

    getPitch() {
        const maxFreq = 50;
        let frequency = maxFreq;
        if (this.isInitialized) {
            this.analyser.getByteFrequencyData( this.buffer );
            frequency = this.buffer.reduce((max, value, index) => value > max.value ? { value, index } : max, {value: 0, index: 0}).index
        }

        const result = Math.min(1, frequency / maxFreq);

        return result;
    }
}