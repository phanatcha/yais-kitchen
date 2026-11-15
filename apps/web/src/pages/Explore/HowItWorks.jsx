import { Link } from "react-router";
import DisplayTitle from "../../components/explore/DisplayTitle.jsx";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import sparkle from "../../assets/sparkle.svg";
import sparkleTurmeric from "../../assets/sparkle-56-turmeric.svg";
import zigzag from "../../assets/zigzag-works.svg";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    title: "Pick your Yai",
    text: [
      "Read her story, see her recipes and choose the grandmother you want to cook with.",
    ],
    photo: "Yai in her kitchen",
    tone: "palm",
  },
  {
    title: "Book a time",
    text: [
      "Choose a day and time that fits your trip.",
      "A class is THB 800–1,200.",
    ],
    photo: "Laptop on a kitchen counter",
    tone: "pandan",
  },
  {
    title: "Get ready",
    text: [
      "Before the class we tell you what to buy and what you need in your kitchen.",
    ],
    photo: "Fresh ingredients at a Thai market",
    tone: "thaiTea",
  },
  {
    title: "Cook live",
    text: [
      "Your Yai watches you cook and helps in real time. Your helper interprets, so nothing gets lost.",
    ],
    photo: "Cooking along on a video call",
    tone: "turmeric",
  },
];

/** Figma 02 How It Works. */
export default function HowItWorks() {
  return (
    <div className={styles.page}>
      <section className={ex.section}>
        <div className={`${ex.inner} ${styles.hero}`}>
          <DisplayTitle
            main="How a class"
            script="works"
            zigzag={{ src: zigzag, width: 320, height: 38 }}
          />
          <p className={styles.lead}>
            You pick a Yai, book a time and cook together live online. A human
            helper joins every class to interpret.
          </p>
          <img
            className={styles.sparkle}
            src={sparkle}
            alt=""
            width="72"
            height="72"
          />
        </div>
      </section>

      <section className={ex.section} aria-label="The steps">
        <ol className={`${ex.inner} ${styles.steps}`}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.step}>
              <PhotoSlot
                label={step.photo}
                tone={step.tone}
                className={styles.photo}
              />
              <div className={styles.text}>
                <span className={styles.number} aria-hidden="true">
                  {i + 1}
                </span>
                <h2 className={styles.title}>{step.title}</h2>
                {step.text.map((line) => (
                  <p key={line} className={styles.body}>
                    {line}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={ex.section}>
        <div className={`${ex.inner} ${styles.panel}`}>
          <div>
            <p className={styles.panelScript}>Already in Thailand?</p>
            <h2 className={styles.panelTitle}>Why book online?</h2>
          </div>
          <div>
            <p className={styles.panelText}>
              You don&apos;t need to plan your trip around a class or travel
              across town. Cook from where you are staying, at a time that suits
              you.
            </p>
            <Link to="/yais" className={ui.turmeric}>
              Find your Yai
            </Link>
          </div>
          <img
            className={styles.panelSparkle}
            src={sparkleTurmeric}
            alt=""
            width="56"
            height="56"
          />
        </div>
      </section>
    </div>
  );
}
