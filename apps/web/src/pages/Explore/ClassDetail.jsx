import { Link, useParams } from "react-router";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import imageMark from "../../assets/image-mark.svg";
import sparkleCoral from "../../assets/sparkle-20-coral.svg";
import sparkleCream from "../../assets/sparkle-cream.svg";
import { useClass } from "../../lib/booking.js";
import {
  regionFamilyRecipe,
  regionRecipes,
  useYai,
} from "../../lib/catalog.js";
import { formatTHB } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./ClassDetail.module.css";

/** Figma 06 Class Detail. */
export default function ClassDetail() {
  const { classId } = useParams();
  const classQuery = useClass(classId);
  const yaiQuery = useYai(classQuery.data?.yaiId);

  if (classQuery.isPending) {
    return (
      <div className={ui.page}>
        <Loading label="Loading the class…" />
      </div>
    );
  }
  if (classQuery.isError) {
    return (
      <div className={ui.page}>
        <ErrorNotice error={classQuery.error} />
      </div>
    );
  }

  const c = classQuery.data;
  const yai = yaiQuery.data;
  const how = [
    `Live online with ${c.yaiName}, who watches you cook.`,
    "A human helper interprets the whole class.",
    `About ${c.durationMinutes} minutes, on the day and time you choose.`,
  ];

  return (
    <div className={styles.page}>
      <title>{`${c.dish} with ${c.yaiName} · Yai's Kitchen`}</title>
      <section className={ex.section}>
        <div className={`${ex.inner} ${styles.banner}`}>
          <span className={styles.photoLabel}>
            <img src={imageMark} alt="" width="32" height="26" />
            {c.photo?.alt || `${c.dish} photo`}
          </span>
          {c.isSample && (
            <span className={`${ui.tag} ${styles.sample}`}>Sample class</span>
          )}
          <div className={styles.tab}>
            <h1 className={styles.dish}>{c.dish}</h1>
            <p className={styles.subtitle}>
              {yai ? `${regionFamilyRecipe(yai.region)}, with ` : "With "}
              {c.yaiName}
            </p>
          </div>
          <img
            className={styles.sparkle}
            src={sparkleCream}
            alt=""
            width="72"
            height="72"
          />
        </div>
      </section>

      <section className={ex.section}>
        <div className={`${ex.inner} ${styles.body}`}>
          <div className={styles.details}>
            <h2 className={styles.heading}>What you will cook</h2>
            <p className={styles.text}>{c.description}</p>

            <h2 className={styles.heading}>How the class works</h2>
            <ul className={styles.how}>
              {how.map((line) => (
                <li key={line}>
                  <img src={sparkleCoral} alt="" width="20" height="20" />
                  {line}
                </li>
              ))}
            </ul>

            <h2 className={styles.heading}>What you need</h2>
            <p className={styles.text}>
              A place to cook, a phone or laptop, and the ingredients on our
              list. We send you the list after you book.
            </p>

            <section className={styles.yai} aria-label="Your Yai">
              <PhotoSlot
                shape="circle"
                tone="palm"
                label={yai?.photo?.alt || "Yai portrait"}
                photo={yai?.photo}
                sizes="240px"
                className={styles.yaiPhoto}
              />
              <div className={styles.yaiText}>
                <p className={styles.yaiScript}>Your Yai</p>
                <p className={styles.yaiName}>{c.yaiName}</p>
                {yai && <p className={ui.body}>{regionRecipes(yai.region)}</p>}
              </div>
              <Link to={`/yais/${c.yaiId}`} className={ui.outline}>
                Meet her
              </Link>
            </section>
          </div>

          <aside className={styles.card} aria-label="Book this class">
            <p className={styles.price}>{formatTHB(c.price.amount)}</p>
            <p className={ui.body}>per person, for one class</p>
            <ul className={`${ex.tags} ${styles.tags}`}>
              <li className={ui.tagPandan}>Live online</li>
              <li className={ui.tagTea}>Any time</li>
              <li className={ui.tagTurmeric}>Family recipe</li>
            </ul>
            <dl className={styles.facts}>
              <div>
                <dt>Class length</dt>
                <dd>About {c.durationMinutes} minutes</dd>
              </div>
              <div>
                <dt>Helper</dt>
                <dd>Included</dd>
              </div>
              <div>
                <dt>Travel</dt>
                <dd>None, you cook where you are</dd>
              </div>
            </dl>
            <Link
              to={`/classes/${c.id}/book`}
              className={`${ui.primary} ${ui.block}`}
            >
              Book this class
            </Link>
            <p className={`${ui.body} ${styles.next}`}>
              You pick a time on the next step.
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
