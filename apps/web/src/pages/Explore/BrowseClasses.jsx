import CardList from "../../components/explore/CardList.jsx";
import ClassCard from "../../components/explore/ClassCard.jsx";
import DisplayTitle from "../../components/explore/DisplayTitle.jsx";
import SearchField from "../../components/explore/SearchField.jsx";
import ringCoral from "../../assets/dish-ring-coral.svg";
import ringPalm from "../../assets/dish-ring-palm.svg";
import ringPandan from "../../assets/dish-ring-pandan.svg";
import ringTea from "../../assets/dish-ring-tea.svg";
import ringTurmeric from "../../assets/dish-ring-turmeric.svg";
import allPhoto from "../../assets/photos/dishes/all.webp";
import curriesPhoto from "../../assets/photos/dishes/curries.webp";
import dessertsPhoto from "../../assets/photos/dishes/desserts.webp";
import noodlesPhoto from "../../assets/photos/dishes/noodles.webp";
import saladsPhoto from "../../assets/photos/dishes/salads.webp";
import stirFriesPhoto from "../../assets/photos/dishes/stir-fries.webp";
import sparkle from "../../assets/sparkle-56.svg";
import zigzag from "../../assets/zigzag-dish.svg";
import { useClassPages } from "../../lib/catalog.js";
import { useSearchText } from "../../lib/searchParams.js";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./BrowseClasses.module.css";

/**
 * The dish circles. Classes have no dish type yet, so each one searches the
 * dish names and descriptions for a word. The chosen circle has the coral ring.
 */
const DISHES = [
  {
    key: "",
    label: "All dishes",
    word: "",
    ring: ringPalm,
    photo: allPhoto,
  },
  {
    key: "curries",
    label: "Curries",
    word: "curry",
    ring: ringTea,
    photo: curriesPhoto,
  },
  {
    key: "noodles",
    label: "Noodles",
    word: "noodle",
    ring: ringPandan,
    photo: noodlesPhoto,
  },
  {
    key: "stir-fries",
    label: "Stir-fries",
    word: "stir-fr",
    ring: ringTurmeric,
    photo: stirFriesPhoto,
  },
  {
    key: "salads",
    label: "Salads",
    word: "salad",
    ring: ringPandan,
    photo: saladsPhoto,
  },
  {
    key: "desserts",
    label: "Desserts",
    word: "dessert",
    ring: ringPalm,
    photo: dessertsPhoto,
  },
];

/** Figma 05 Browse Classes. */
export default function BrowseClasses() {
  const { text, setText, q, params, setParams } = useSearchText();
  const dishKey = params.get("dish") ?? "";
  const dish = DISHES.find((d) => d.key === dishKey) ?? DISHES[0];
  const list = useClassPages({ q: q || dish.word || undefined });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  function typeSearch(value) {
    setText(value);
    if (dish.key) setParams({ dish: "" });
  }

  function pickDish(d) {
    setText("");
    setParams({ dish: d.key, q: "" });
  }

  return (
    <div className={styles.page}>
      <section className={ex.section}>
        <div className={`${ex.inner} ${ex.browseHero}`}>
          <div className={ex.browseIntro}>
            <DisplayTitle
              main="Pick your"
              script="dish"
              zigzag={{ src: zigzag, width: 190, height: 34 }}
            />
            <p className={ex.browseLead}>
              Every class is live online with a Yai and a human helper. A class
              is THB 800–1,200.
            </p>
            <img
              className={`${ex.browseSparkle} ${styles.sparkle}`}
              src={sparkle}
              alt=""
              width="56"
              height="56"
            />
          </div>
          <div className={ex.browseTools}>
            <SearchField
              label="Search by dish or Yai"
              placeholder="Search by dish or Yai"
              value={text}
              onChange={typeSearch}
            />
            <ul className={ex.tags} aria-label="Every class">
              <li className={ui.tagPandan}>Live online</li>
              <li className={ui.tagTea}>Any time</li>
              <li className={ui.tagTurmeric}>Family recipe</li>
            </ul>
            {items.some((c) => c.isSample) && (
              <p className={ex.browseNote}>
                These classes are samples for our prototype.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className={ex.section} aria-label="Classes">
        <div className={ex.inner}>
          <div className={styles.dishes} role="group" aria-label="Dish">
            {DISHES.map((d) => {
              const chosen = d.key === dish.key && !q;
              return (
                <button
                  key={d.label}
                  type="button"
                  className={styles.dish}
                  aria-pressed={chosen}
                  onClick={() => pickDish(d)}
                >
                  <span className={styles.circle}>
                    <img
                      src={chosen ? ringCoral : d.ring}
                      alt=""
                      width="132"
                      height="132"
                    />
                    <img
                      className={styles.slot}
                      src={d.photo}
                      alt=""
                      width="108"
                      height="108"
                    />
                  </span>
                  {d.label}
                </button>
              );
            })}
          </div>

          <div className={styles.list}>
            <CardList
              items={items}
              isPending={list.isPending}
              error={list.error}
              columns={3}
              label="Classes"
              empty={
                q || dish.key
                  ? "No class matches that yet. Try another dish."
                  : "Classes will be here soon."
              }
              renderItem={(c, i) => (
                <ClassCard classInfo={c} index={i} headingLevel={2} />
              )}
            />
            {list.hasNextPage && (
              <div className={ex.more}>
                <button
                  type="button"
                  className={ui.outline}
                  onClick={() => list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                >
                  {list.isFetchingNextPage ? "Loading…" : "Show more classes"}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
