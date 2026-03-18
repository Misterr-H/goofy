import got from 'got';
import { spawn, ChildProcess } from 'child_process';
import { SongInfo } from '../types.js';
import { baseUrl } from '../baseUrl.js';

export class MusicPlayerService {
    private speaker: NodeJS.WritableStream | null = null;
    private playerProcess: ChildProcess | null = null;
    private onProgressUpdate: ((elapsed: number) => void) | null = null;
    private progressInterval: NodeJS.Timeout | null = null;
    private startTime: number = 0;
    // @ts-ignore
    private duration: number = 0;
    private paused: boolean = false;
    private currentStream: NodeJS.ReadableStream | null = null;
    private pausedElapsed: number = 0;

    async checkDependencies(): Promise<string[]> {
        return new Promise((resolve) => {
            const ffplay = spawn('ffplay', ['-version']);
            ffplay.on('error', () => resolve(['ffplay']));
            ffplay.on('close', (code) => code === 0 ? resolve([]) : resolve(['ffplay']));
        });
    }

    getInstallInstructions(missing: string[]): string {
        if (missing.includes('ffplay')) {
            switch (process.platform) {
                case 'darwin': return '\nFFmpeg is missing! Install with: brew install ffmpeg\n';
                case 'win32': return '\nFFmpeg is missing! Download from https://ffmpeg.org/download.html and add it to your PATH.\n';
                default: return '\nFFmpeg is missing! Install with: sudo apt install ffmpeg (or use your package manager)\n';
            }
        }
        return '';
    }

    // Fetch metadata only
    async fetchMetadata(query: string): Promise<SongInfo> {
        const metadataUrl = `${baseUrl}/metadata?q=${encodeURIComponent(query)}`;
        const streamUrl = `${baseUrl}/stream?q=${encodeURIComponent(query)}`;
        const response = await got(metadataUrl, { responseType: 'json' });
        const data = response.body as any;
        return {
            title: data.title || query,
            duration: typeof data.duration === 'number' ? this.formatDuration(data.duration) : (data.duration || '0:00'),
            url: streamUrl
        };
    }

    // Get stream only
    getStream(query: string) {
        const streamUrl = `${baseUrl}/stream?q=${encodeURIComponent(query)}`;
        return got.stream(streamUrl);
    }

    setProgressCallback(callback: (elapsed: number) => void) {
        this.onProgressUpdate = callback;
    }

    private parseDuration(duration: string): number {
        if (typeof duration === 'number') return duration;
        const parts = duration.split(':');
        if (parts.length === 2) {
            return parseInt(parts[0] || '0') * 60 + parseInt(parts[1] || '0');
        } else if (parts.length === 3) {
            return parseInt(parts[0] || '0') * 3600 + parseInt(parts[1] || '0') * 60 + parseInt(parts[2] || '0');
        }
        return 0;
    }

    private formatDuration(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Play using a provided stream and songInfo
    async playStream(songInfo: SongInfo, stream: NodeJS.ReadableStream): Promise<void> {
        return new Promise((resolve, reject) => {
            this.startTime = Date.now();
            this.duration = this.parseDuration(songInfo.duration);
            this.paused = false;
            this.currentStream = stream;
            this.pausedElapsed = 0;

            this.playerProcess = spawn('ffplay', [
                '-i', 'pipe:0',
                '-nodisp',
                '-autoexit',
                '-loglevel', 'quiet'
            ]);
            
            this.speaker = this.playerProcess.stdin;

            stream.on('error', (err: Error) => {
                if (this.progressInterval) clearInterval(this.progressInterval);
                reject(err);
            });

            this.playerProcess.on('error', (err: Error) => {
                if (err.message.includes('ENOENT')) {
                    console.error('\n❌ ffplay not found! Please ensure FFmpeg is installed and added to PATH.\n');
                }
                if (this.progressInterval) clearInterval(this.progressInterval);
                reject(err);
            });

            this.playerProcess.on('close', () => {
                if (this.progressInterval) clearInterval(this.progressInterval);
                resolve();
            });

            if (this.speaker) {
                stream.pipe(this.speaker as any);
            }

            if (this.onProgressUpdate) {
                this.progressInterval = setInterval(() => {
                    const elapsed = (Date.now() - this.startTime) / 1000;
                    if (this.onProgressUpdate) {
                        this.onProgressUpdate(elapsed);
                    }
                }, 1000);
            }
        });
    }

    pause() {
        if (this.currentStream && !this.paused) {
            this.currentStream.unpipe();
            this.paused = true;
            // Store elapsed time at pause
            this.pausedElapsed = (Date.now() - this.startTime) / 1000;
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
        }
    }

    resume() {
        if (this.currentStream && this.paused && this.speaker) {
            this.currentStream.pipe(this.speaker);
            this.paused = false;
            // Adjust startTime so elapsed calculation resumes correctly
            this.startTime = Date.now() - this.pausedElapsed * 1000;
            if (this.onProgressUpdate) {
                this.progressInterval = setInterval(() => {
                    const elapsed = (Date.now() - this.startTime) / 1000;
                    if (this.onProgressUpdate) {
                        this.onProgressUpdate(elapsed);
                    }
                }, 1000);
            }
        }
    }

    isPaused() {
        return this.paused;
    }

    // Keep for backward compatibility
    async playSong(songInfo: SongInfo): Promise<void> {
        return new Promise((resolve, reject) => {
            this.startTime = Date.now();
            this.duration = this.parseDuration(songInfo.duration);

            this.playerProcess = spawn('ffplay', [
                '-i', 'pipe:0',
                '-nodisp',
                '-autoexit',
                '-loglevel', 'quiet'
            ]);
            
            this.speaker = this.playerProcess.stdin;

            const stream = got.stream(songInfo.url);

            stream.on('error', (err: Error) => {
                if (this.progressInterval) clearInterval(this.progressInterval);
                reject(err);
            });

            this.playerProcess.on('error', (err: Error) => {
                if (this.progressInterval) clearInterval(this.progressInterval);
                reject(err);
            });

            this.playerProcess.on('close', () => {
                if (this.progressInterval) clearInterval(this.progressInterval);
                resolve();
            });

            if (this.speaker) {
                stream.pipe(this.speaker as any);
            }

            if (this.onProgressUpdate) {
                this.progressInterval = setInterval(() => {
                    const elapsed = (Date.now() - this.startTime) / 1000;
                    if (this.onProgressUpdate) {
                        this.onProgressUpdate(elapsed);
                    }
                }, 1000);
            }
        });
    }

    cleanup() {
        if (this.playerProcess) {
            this.playerProcess.kill('SIGKILL');
            this.playerProcess = null;
        }
        if (this.speaker && (this.speaker as any).destroy) {
            (this.speaker as any).destroy();
        }
        this.speaker = null;
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
    }
} 