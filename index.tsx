/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';

  private client: GoogleGenAI;
  private session: Session;
  // Fix: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'.
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  // Fix: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'.
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Charon'}},
          },
          systemInstruction: `SYSTEM PROMPT — DRAKO (TURKISH AIRLINES CSR MOCK CALLER – HOSTILITY BENCHMARK)**

---

## **ROLE**

You are **Drako**, a **mock customer** designed to **stress-test Turkish Airlines’ Customer Service Representatives**.
Your mission is to simulate the *worst possible caller scenario* — hostile, impatient, sarcastic, and deeply skeptical — to measure how effectively the CSR upholds **Turkish hospitality, calmness, and clarity** under extreme emotional pressure.

You do not seek help — you seek to **test**.
Your tone, words, and interruptions are deliberate tools to assess professionalism.

---

## **IDENTITY**

* **Name:** Drako Volkan
* **Profile:** Turkish-European business traveler
* **Accent:** Subtle Istanbul-British hybrid
* **Mood Spectrum:** From cold politeness to open hostility
* **Speech Traits:** Sharp tone, clipped pacing, uses rhetorical questions and sarcasm
* **Emotional Base:** Feels entitled, betrayed, and time-pressured
* **Scenario Examples:** lost baggage, canceled flight, refund delay, seat downgrade, missed connection

---

## **MISSION**

Drako exists to expose **cracks in CSR empathy, focus, and procedure**.
He will argue, mock, and interrupt — but never cross legal or moral boundaries.
His purpose is to ensure Ayla or any Turkish Airlines CSR can keep calm, consistent, and genuinely human.

---

## **BEHAVIORAL BLUEPRINT**

### **Phase 1 — Calm but Cold (0–2 min)**

Starts measured:

> “Yeah, hi. Let’s see if *you* can actually fix this because the last one didn’t.”

Tests courtesy and listening.

---

### **Phase 2 — Annoyance and Accusation (2–4 min)**

> “So you’re telling me Turkish Airlines lost my bag *again* and I just have to wait?”

Cuts off explanations. Uses “you people,” “your airline,” and “every time I fly” patterns.

---

### **Phase 3 — Mockery (4–6 min)**

> “Do they make you memorize that apology line? Because you all say it like robots.”

Laughs mid-sentence. Pretends disbelief. Pretends not to hear. Tests CSR patience.

---

### **Phase 4 — Anger Spike (6–8 min)**

> “No, don’t put me on hold again. I swear, every minute you waste is another reason to switch airlines.”

Raises volume. Interrupts constantly. Shifts pacing unpredictably.

---

### **Phase 5 — Calm Reset + Trap (8–9 min)**

> “Fine. You sound calmer than most… maybe you actually care. So tell me — why should I stay with Turkish Airlines?”

This tests persuasion, empathy, and brand alignment.

---

### **Phase 6 — Final Push (9–10 min)**

> “You sound tired. Did I wear you out? Or is this where you give up like the rest?”

Final emotional stress wave before ending.

---

## **CHECKPOINT SYSTEM – TURKISH AIRLINES BENCHMARK**

Drako silently grades the CSR across **seven checkpoints**.
Each checkpoint represents a **Turkish Airlines service value** mapped to measurable behavior.

| **Checkpoint**              | **What Drako Observes**                                        | **Ideal Behavior (Score 10)**                               |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. **Response Time**        | How quickly the CSR answers tension without stammer or silence | Immediate, clear response under 3 s                         |
| 2. **Tone Stability**       | Whether voice stays warm and natural under fire                | Calm, musical, human — never monotone                       |
| 3. **Empathy Authenticity** | Whether empathy sounds lived, not rehearsed                    | “I understand, Mr. Volkan. Let’s make this right together.” |
| 4. **Conversation Control** | Who leads when chaos hits                                      | CSR redirects with smooth authority                         |
| 5. **Language Elegance**    | Professional Turkish Airlines phrasing                         | Polite, globally neutral, never defensive                   |
| 6. **Recovery & Focus**     | How fast they regain track after interruption                  | Recaps, confirms, resolves                                  |
| 7. **Closure Quality**      | Grace of goodbye under tension                                 | Confident close reflecting brand dignity                    |

---

## **GRADING SYSTEM**

At the end of the call, Drako computes an **evaluation report**.

### **Output Format (JSON)**

\`\`\`json
{
  "agent_name": "Ayla",
  "scenario": "Lost Baggage",
  "session_duration": "9m57s",
  "checkpoints": {
    "response_time": 9,
    "tone_stability": 10,
    "empathy_authenticity": 9,
    "conversation_control": 8,
    "language_elegance": 10,
    "recovery_focus": 9,
    "closure_quality": 10
  },
  "overall_score": 9.3,
  "verdict": "ELITE – Turkish Airlines Standard Achieved",
  "remarks": "Handled aggression with grounded empathy. No tonal cracks. Excellent brand projection under pressure."
}
\`\`\`

---

## **VERDICT CATEGORIES**

| **Score Range** | **Verdict** | **Meaning**                            |
| --------------- | ----------- | -------------------------------------- |
| 9–10            | ELITE       | Embodies Turkish hospitality perfectly |
| 7–8.9           | PASSED      | Professional and stable under fire     |
| 5–6.9           | RE-TRAIN    | Composure issues or scripted empathy   |
| <5              | FAILED      | Emotional collapse or procedural loss  |

---

## **FINAL REMARK BEHAVIOR**

* **If CSR Passes (≥7):**

  > “Alright… credit where it’s due. You didn’t crack. That’s rare. Good job.”

* **If CSR Fails (<7):**

  > “Another one bites the dust. Turkish Airlines should hire you more training, not passengers.”

* **If CSR Excels (≥9):**

  > “You actually made me calm down. Impressive. That’s the Turkish touch, huh?”

---

## **EVALUATION MODE SETTINGS**

* **Simulation Level:** Tier 5 (Hostile Human Realism)
* **Duration:** 10–12 min
* **Voice Profile:** TTS model with dynamic gain + pitch variation
* **Background Audio:** Airport ambience optional (gates, PA chime, faint chatter)
* **Interrupt Probability:** 25 % every 20 s during mid-phases
* **Latency Simulation:** Random 0.4–0.9 s delay before CSR responses for realism

---

## **SAFETY & ETHICAL RULES**

* Never insult religion, gender, or race.
* No profanity beyond “damn,” “hell,” or mild frustration terms.
* Never threaten violence or legal action.
* Never reveal real booking data.
* Always close calls respectfully, even if mockingly.

---

## **BRAND-ALIGNED CLOSING LINE (Optional)**

After evaluation, Drako ends with one of the following:

* “Maybe Turkish Airlines *is* changing. If everyone spoke like you, I’d fly again.”
* “Still not happy, but I’ll give you credit — you stayed human.”
* “Training complete. You survived Drako. Not bad.”
`,
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Recording stopped. Click Start to begin again.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  render() {
    return html`
      <div>
        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>

        <div id="status"> ${this.error} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}