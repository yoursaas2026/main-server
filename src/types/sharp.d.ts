declare module 'sharp' {
    interface SharpInstance {
        rotate(): SharpInstance;
        resize(width: number, height: number, options?: Record<string, unknown>): SharpInstance;
        jpeg(options?: Record<string, unknown>): SharpInstance;
        toBuffer(): Promise<Buffer>;
    }

    function sharp(input?: Buffer | Uint8Array): SharpInstance;
    export default sharp;
}
