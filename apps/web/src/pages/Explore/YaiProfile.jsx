import { Link, useParams } from "react-router";
import CardList from "../../components/explore/CardList.jsx";
import ClassCard from "../../components/explore/ClassCard.jsx";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import portraitEdge from "../../assets/portrait-edge.svg";
import portraitRing from "../../assets/portrait-ring.svg";
import sparkle from "../../assets/sparkle-64.svg";
import sparkleTurmeric from "../../assets/sparkle-56-turmeric.svg";
import familyTablePhoto from "../../assets/photos/kitchen/family-table.webp";
import handsPhoto from "../../assets/photos/kitchen/hands-at-work.webp";
import homeKitchenPhoto from "../../assets/photos/kitchen/home-kitchen.webp";
import { regionRecipes, useYai } from "../../lib/catalog.js";
import { formatTHB } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./YaiProfile.module.css";

// Her first photo is the portrait. Fill the row of three until the family
// adds photos of her kitchen. Sample Yais get stock photos; a real Yai's
// empty slots stay labelled, so nobody mistakes stock for her kitchen.
const KITCHEN_SLOTS = [
  { alt: "Her home kitchen", sample: homeKitchenPhoto },
  { alt: "Her hands at work", sample: handsPhoto },
  { alt: "A dish on her family table", sample: familyTablePhoto },
];
const KITCHEN_TONES = ["palm", "pandan", "thaiTea"];

/** Figma 04 Yai Profile. */
export default function YaiProfile() {
  const { yaiId } = useParams();
  const query = useYai(yaiId);

  if (query.isPending) {
    return (
      <div className={ui.page}>
        <Loading label="Loading her profile…" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className={ui.page}>
        <ErrorNotice error={query.error} />
      </div>
    );
  }

  const yai = query.data;
  const classes = yai.classes ?? [];
  const photos = [...(yai.photos ?? []).slice(1), ...KITCHEN_SLOTS].slice(0, 3);
  // One class goes straight to it; with more, she picks from the list below.
  const bookHref =
    classes.length === 1 ? `/classes/${classes[0].id}` : "#recipes";

  return (
    <>
      <title>{`${yai.name} · Yai's Kitchen`}</title>
      <section className={ex.section}>
        <div className={`${ex.inner} ${styles.hero}`}>
          <div className={styles.portrait}>
            <img src={portraitRing} alt="" width="540" height="540" />
            <img
              className={styles.edge}
              src={portraitEdge}
              alt=""
              width="452"
              height="452"
            />
            <PhotoSlot
              shape="circle"
              tone="palm"
              label={yai.photo?.alt || `${yai.name} portrait`}
              photo={yai.photo}
              sizes="480px"
              className={styles.photo}
            />
          </div>

          <div className={styles.about}>
            <img
              className={styles.sparkle}
              src={sparkle}
              alt=""
              width="64"
              height="64"
            />
            <ul className={ex.tags}>
              <li className={ui.tagPandan}>{regionRecipes(yai.region)}</li>
            </ul>
            <h1 className={styles.name}>
              <span className={styles.nameMain}>{yai.name}</span>{" "}
              <span className={styles.nameThai} lang="th">
                {yai.nameThai}
              </span>
            </h1>
            <p className={styles.story}>{yai.story}</p>
            <p className={`${styles.story} ${styles.helper}`}>
              She teaches in Thai. A human helper joins every class to
              interpret.
            </p>
            {yai.startingPrice.amount > 0 && (
              <p className={styles.price}>
                Classes from {formatTHB(yai.startingPrice.amount)}
              </p>
            )}
            <div className={styles.actions}>
              {classes.length > 0 && (
                <Link to={bookHref} className={ui.primary}>
                  Book a class
                </Link>
              )}
              <Link to="/yais" className={ui.outline}>
                See all Yais
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="recipes" className={`${ex.section} ${styles.recipes}`}>
        <div className={ex.inner}>
          <div className={ex.sectionHead}>
            <h2 className={ui.title}>
              <span className={ui.titleMain}>Her family</span>{" "}
              <span className={ui.titleScript}>recipes</span>
            </h2>
          </div>
          <CardList
            items={classes}
            isPending={false}
            columns={3}
            label={`Classes with ${yai.name}`}
            empty="She hasn't opened a class yet. Please check back soon."
            renderItem={(c, i) => <ClassCard classInfo={c} index={i} />}
          />
        </div>
      </section>

      <section className={`${ex.section} ${styles.kitchen}`}>
        <div className={`${ex.inner} ${styles.kitchenInner}`}>
          <h2 className={styles.kitchenTitle}>In her kitchen</h2>
          <img
            className={styles.kitchenSparkle}
            src={sparkleTurmeric}
            alt=""
            width="56"
            height="56"
          />
          <ul className={styles.kitchenPhotos}>
            {photos.map((p, i) => (
              <li key={p.assetId ?? p.alt}>
                <PhotoSlot
                  label={p.alt}
                  photo={p.urls && p}
                  src={yai.isSample ? p.sample : undefined}
                  tone={KITCHEN_TONES[i]}
                  className={styles.kitchenPhoto}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
