import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import CardList from "../../components/explore/CardList.jsx";
import ClassCard from "../../components/explore/ClassCard.jsx";
import YaiCard from "../../components/explore/YaiCard.jsx";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import PraJamYam from "../../components/site/PraJamYam.jsx";
import foodRing from "../../assets/food-ring.svg";
import plateEdge from "../../assets/plate-edge.svg";
import sparkle from "../../assets/sparkle.svg";
import sparkle36 from "../../assets/sparkle-36.svg";
import sparkleCoral from "../../assets/sparkle-coral.svg";
import stepNumber from "../../assets/step-number.svg";
import zigzag from "../../assets/zigzag-grandma.svg";
import { useClasses, useYais } from "../../lib/catalog.js";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./Home.module.css";

const STEPS = [
  ["Pick a Yai", "Choose a grandmother and the family recipes she teaches."],
  ["Book a time", "Any day and any time that fits your trip."],
  ["Cook live", "Cook along online from where you are staying. No travel."],
];

/**
 * Featured items first, then others until there are `count`, so the row is
 * full even when only one or two are featured.
 */
function useFeatured(useList, count) {
  const featured = useList({ featured: true, limit: count });
  const all = useList({ limit: count });
  const first = featured.data?.items ?? [];
  const rest = (all.data?.items ?? []).filter(
    (item) => !first.some((f) => f.id === item.id),
  );
  return {
    items: [...first, ...rest].slice(0, count),
    isPending: featured.isPending || all.isPending,
    error: featured.error ?? all.error,
  };
}

/** Figma 01 Home. */
export default function Home() {
  const navigate = useNavigate();
  const dishId = useId();
  const whyId = useId();
  const [dish, setDish] = useState("");
  const yais = useFeatured(useYais, 4);
  const classes = useFeatured(useClasses, 3);

  function findYai(event) {
    event.preventDefault();
    const q = dish.trim();
    navigate(q ? `/yais?q=${encodeURIComponent(q)}` : "/yais");
  }

  const yaiItems = yais.items;
  const classItems = classes.items;

  return (
    <>
      <section className={`${ex.section} ${styles.hero}`}>
        <div className={`${ex.inner} ${styles.heroInner}`}>
          <div className={styles.heroText}>
            <img
              className={styles.sparkleBig}
              src={sparkle}
              alt=""
              width="72"
              height="72"
            />
            <img
              className={styles.sparkleSmall}
              src={sparkleCoral}
              alt=""
              width="28"
              height="28"
            />
            <h1 className={styles.heroTitle}>
              <span className={styles.heroLine}>Cook with</span>{" "}
              <span className={styles.heroLine}>a real Thai</span>{" "}
              <span className={styles.heroScript}>Grandma</span>
            </h1>
            <img
              className={styles.heroZigzag}
              src={zigzag}
              alt=""
              width="442"
              height="38"
            />
            <p className={styles.heroLead}>
              Live online cooking classes with Thai grandmothers.
              <br />
              Any time, no travel.
            </p>

            <form className={styles.finder} role="search" onSubmit={findYai}>
              <div className={styles.finderField}>
                <label htmlFor={dishId} className={styles.finderLabel}>
                  What to cook
                </label>
                <input
                  id={dishId}
                  className={styles.finderInput}
                  placeholder="Any dish"
                  value={dish}
                  onChange={(e) => setDish(e.target.value)}
                />
              </div>
              <span className={styles.finderDivider} aria-hidden="true" />
              <div className={styles.finderField}>
                <span className={styles.finderLabel}>When</span>
                <span className={styles.finderValue}>Any day</span>
              </div>
              <button
                type="submit"
                className={`${ui.primary} ${styles.finderButton}`}
              >
                Find your Yai
              </button>
            </form>
          </div>

          <div className={styles.collage} aria-hidden="true">
            <PhotoSlot
              label="Yai cooking at home"
              tone="palm"
              className={`${styles.photo} ${styles.photoHome}`}
            />
            <PhotoSlot
              label="Temple at sunset"
              tone="pandan"
              className={`${styles.photo} ${styles.photoTemple}`}
            />
            <PhotoSlot
              label="Floating market"
              tone="thaiTea"
              className={`${styles.photo} ${styles.photoMarket}`}
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
              label="Dish from above"
              tone="rice"
              shape="circle"
              className={styles.dish}
            />
            <img
              className={styles.sparkleEdge}
              src={sparkle36}
              alt=""
              width="36"
              height="36"
            />
          </div>
        </div>
      </section>

      <section className={styles.why} aria-labelledby={whyId}>
        <PraJamYam />
        <div className={`${ex.section}`}>
          <div className={`${ex.inner} ${styles.whyInner}`}>
            <div>
              <h2 id={whyId} className={styles.whyTitle}>
                A video can&apos;t
                <br />
                watch you cook.
              </h2>
              <p className={styles.whyScript}>Your Yai can.</p>
              <p className={styles.whyLead}>
                She teaches you live and helps while you cook. A human helper
                joins every class to interpret, so you can ask anything.
              </p>
              <Link to="/how-it-works" className={ui.turmeric}>
                See how it works
              </Link>
            </div>
            <ol className={styles.steps}>
              {STEPS.map(([title, text], i) => (
                <li key={title} className={styles.step}>
                  <span className={styles.stepNumber}>
                    <img src={stepNumber} alt="" width="72" height="72" />
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

      <section className={`${ex.section} ${styles.yais}`}>
        <div className={ex.inner}>
          <div className={ex.sectionHead}>
            <div>
              <h2 className={ui.title}>
                <span className={ui.titleMain}>Meet the</span>{" "}
                <span className={ui.titleScript}>Yais</span>
              </h2>
              {yaiItems.some((y) => y.isSample) && (
                <p className={`${ui.body} ${styles.yaiNote}`}>
                  These Yais are samples for our prototype.
                </p>
              )}
            </div>
            <Link to="/yais" className={ui.outline}>
              See all Yais
            </Link>
          </div>
          <CardList
            items={yaiItems}
            isPending={yais.isPending}
            error={yais.error}
            columns={4}
            label="Yais"
            empty="Our Yais will be here soon."
            renderItem={(yai, i) => <YaiCard yai={yai} index={i} />}
          />
        </div>
      </section>

      <section className={`${ex.section} ${styles.classes}`}>
        <div className={ex.inner}>
          <div className={ex.sectionHead}>
            <h2 className={ui.title}>
              <span className={ui.titleMain}>What you will</span>{" "}
              <span className={ui.titleScript}>cook</span>
            </h2>
            <Link to="/classes" className={ui.outline}>
              See all classes
            </Link>
          </div>
          <CardList
            items={classItems}
            isPending={classes.isPending}
            error={classes.error}
            columns={3}
            label="Classes"
            empty="Classes will be here soon."
            renderItem={(c, i) => <ClassCard classInfo={c} index={i} />}
          />
        </div>
      </section>

      <section className={`${ex.section} ${styles.support}`}>
        <div className={`${ex.inner} ${styles.panel}`}>
          <PhotoSlot
            label="Yai at home"
            tone="thaiTea"
            shape="circle"
            className={styles.panelPhoto}
          />
          <div>
            <h2 className={styles.panelTitle}>
              Your Yai earns 75%
              <br />
              of what you pay.
            </h2>
            <p className={styles.panelLead}>
              Thai grandmothers get an income from the family recipes they
              already love to cook.
            </p>
            <Link to="/yais" className={ui.primary}>
              Find your Yai
            </Link>
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
    </>
  );
}
