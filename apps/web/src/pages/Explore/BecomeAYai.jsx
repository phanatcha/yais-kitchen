import { Link } from "react-router";
import YaiSignUpForm from "../../components/explore/YaiSignUpForm.jsx";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import PraJamYam from "../../components/site/PraJamYam.jsx";
import foodRing from "../../assets/food-ring.svg";
import plateEdge from "../../assets/plate-edge.svg";
import sparkle from "../../assets/sparkle.svg";
import sparkle36 from "../../assets/sparkle-36.svg";
import stepNumber from "../../assets/step-number-56.svg";
import zigzag from "../../assets/zigzag-grandma.svg";
import { faqAnchor, useFaq } from "../../lib/catalog.js";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./BecomeAYai.module.css";
import grandchildPhoto from "../../assets/photos/yai-and-grandchild.webp";
import familyDishPhoto from "../../assets/photos/family-dish.webp";
import tablePhoto from "../../assets/photos/yai-at-her-table.webp";

const STEPS = [
  [
    "Tell us about her",
    "Fill in the form below together. She should know about it and want to teach.",
  ],
  [
    "Meet and cook together",
    "We visit her kitchen, cook with her and go through a hygiene checklist.",
  ],
  [
    "Practise a class",
    "She teaches a supervised trial class with a helper, so she knows what to expect.",
  ],
  [
    "Start teaching",
    "Guests book her family recipes. She teaches in Thai, from her own kitchen.",
  ],
];

/** Figma 16 Become a Yai: written for the family member who signs her up. */
export default function BecomeAYai() {
  const faq = useFaq();
  const questions =
    faq.data?.groups.find((g) => g.id === "becoming_a_yai")?.items ?? [];
  const helpHref = `/help#${faqAnchor("becoming_a_yai")}`;

  return (
    <>
      <section className={`${ex.section} ${styles.hero}`}>
        <div className={`${ex.inner} ${styles.heroInner}`}>
          <div className={styles.heroText}>
            <img
              className={styles.sparkleSmall}
              src={sparkle36}
              alt=""
              width="36"
              height="36"
            />
            <h1 className={styles.title}>
              <span className={styles.titleLine}>Let your Yai</span>{" "}
              <span className={styles.titleLine}>teach her</span>{" "}
              <span className={styles.titleScript}>recipes</span>
            </h1>
            <img
              className={styles.zigzag}
              src={zigzag}
              alt=""
              width="442"
              height="38"
            />
            <p className={styles.lead}>
              Sign your grandmother up to teach her family recipes live online
              to travellers in Thailand. She cooks in her own kitchen, and a
              helper interprets every class.
            </p>
            <div className={styles.actions}>
              <a href="#sign-up" className={ui.primary}>
                Sign up your Yai
              </a>
              <a href="#questions" className={ui.outline}>
                Questions families ask
              </a>
            </div>
          </div>

          <div className={styles.collage} aria-hidden="true">
            <PhotoSlot
              label="Photo: Yai and grandchild"
              src={grandchildPhoto}
              alt="A Thai grandmother and her grandson giving alms to a monk"
              tone="palm"
              className={styles.photo}
            />
            <img
              className={styles.ring}
              src={foodRing}
              alt=""
              width="420"
              height="420"
            />
            <img
              className={styles.plate}
              src={plateEdge}
              alt=""
              width="320"
              height="320"
            />
            <PhotoSlot
              label="Her family dish"
              src={familyDishPhoto}
              alt="A plate of massaman curry"
              tone="rice"
              shape="circle"
              className={styles.dish}
            />
            <img
              className={styles.sparkleBig}
              src={sparkle}
              alt=""
              width="72"
              height="72"
            />
          </div>
        </div>
      </section>

      <section className={styles.how} aria-labelledby="how-for-her">
        <PraJamYam />
        <div className={ex.section}>
          <div className={`${ex.inner} ${styles.howInner}`}>
            <div>
              <h2 id="how-for-her" className={styles.howTitle}>
                How it works <span className={styles.howScript}>for her</span>
              </h2>
              <p className={styles.howLead}>
                No English or tech skills needed. We train her before her first
                class, and a helper interprets every class.
              </p>
            </div>
            <ol className={styles.steps}>
              {STEPS.map(([title, text], i) => (
                <li key={title} className={styles.step}>
                  <span className={styles.stepNumber}>
                    <img src={stepNumber} alt="" width="56" height="56" />
                    <span>{i + 1}</span>
                  </span>
                  <div>
                    <h3 className={styles.stepTitle}>{title}</h3>
                    <p className={styles.stepText}>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className={`${ex.section} ${styles.earnings}`}>
        <div className={`${ex.inner} ${styles.panel}`}>
          <PhotoSlot
            label="Yai at her table"
            src={tablePhoto}
            alt="A Thai grandmother wrapping food in leaves"
            tone="thaiTea"
            shape="circle"
            className={styles.panelPhoto}
          />
          <div>
            <h2 className={styles.panelTitle}>
              She keeps 75% of what guests pay.
            </h2>
            <p className={styles.panelText}>
              At the sample prices of THB 800 to 1,200 a class, that is THB 600
              to 900 for each guest she teaches.
            </p>
          </div>
          <img
            className={styles.panelSparkle}
            src={sparkle}
            alt=""
            width="72"
            height="72"
          />
        </div>
      </section>

      <section
        id="sign-up"
        className={`${ex.section} ${styles.signUp}`}
        aria-labelledby="sign-up-title"
      >
        <div className={ex.inner}>
          <h2 id="sign-up-title" className={ui.title}>
            <span className={ui.titleMain}>Tell us about</span>{" "}
            <span className={ui.titleScript}>her</span>
          </h2>
          <p className={styles.formLead}>
            Fill this in together with her. You can tell us more when we visit.
          </p>
          <div className={styles.formRow}>
            <YaiSignUpForm />
            <aside
              id="questions"
              className={styles.questions}
              aria-labelledby="questions-title"
            >
              <h3 id="questions-title" className={styles.questionsTitle}>
                Questions families ask
              </h3>
              {questions.length > 0 ? (
                <ul className={styles.questionList}>
                  {questions.slice(0, 4).map((q) => (
                    <li key={q.question}>
                      <Link to={helpHref} className={ui.link}>
                        {q.question}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={ui.body}>
                  About teaching in Thai, the kitchen visit, training and what
                  she earns.
                </p>
              )}
              <Link to={helpHref} className={ui.outline}>
                See all questions
              </Link>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
