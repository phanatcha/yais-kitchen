/** A real STT integration supplies this interface; manual input works without one. */
export class ManualCaptionAdapter {
  async transcribe() {
    throw new Error(
      "Automatic transcription provider is not configured. Use helper captions.",
    );
  }
}
export class MockTranscriptionAdapter {
  constructor(segments = []) {
    this.segments = segments;
  }
  async *transcribe() {
    for (const segment of this.segments) yield segment;
  }
}
