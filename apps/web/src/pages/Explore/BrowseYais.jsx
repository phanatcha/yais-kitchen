import CardList from "../../components/explore/CardList.jsx";
import DisplayTitle from "../../components/explore/DisplayTitle.jsx";
import SearchField from "../../components/explore/SearchField.jsx";
import YaiCard from "../../components/explore/YaiCard.jsx";
import sparkle from "../../assets/sparkle-56.svg";
import zigzag from "../../assets/zigzag-yais.svg";
import { REGION_FILTERS, useYaiPages } from "../../lib/catalog.js";
import { useSearchText } from "../../lib/searchParams.js";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./BrowseYais.module.css";

/** Figma 03 Browse Yais: search by Yai or dish, and filter by region. */
export default function BrowseYais() {
  const { text, setText, q, params, setParams } = useSearchText();
  const region = params.get("region") ?? "";
  const list = useYaiPages({
    q: q || undefined,
    region: region || undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Boolean(q || region);

  return (
    <div className={styles.page}>
      <section className={ex.section}>
        <div className={`${ex.inner} ${ex.browseHero}`}>
          <div className={ex.browseIntro}>
            <DisplayTitle
              main="Meet the"
              script="Yais"
              zigzag={{ src: zigzag, width: 210, height: 34 }}
            />
            <p className={ex.browseLead}>
              Pick the grandmother you want to cook with. Each one teaches her
              own family recipes.
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
              label="Search by Yai or dish"
              placeholder="Search by Yai or dish"
              value={text}
              onChange={setText}
            />
            <div className={ex.tags} role="group" aria-label="Region">
              {REGION_FILTERS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className={ui.chip}
                  aria-pressed={region === r.value}
                  onClick={() => setParams({ region: r.value })}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {items.some((y) => y.isSample) && (
              <p className={ex.browseNote}>
                These Yais are samples for our prototype.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className={ex.section} aria-label="Yais">
        <div className={`${ex.inner} ${ex.browseList}`}>
          <CardList
            items={items}
            isPending={list.isPending}
            error={list.error}
            columns={4}
            label="Yais"
            empty={
              filtered
                ? "No Yai matches that yet. Try another dish or region."
                : "Our Yais will be here soon."
            }
            renderItem={(yai, i) => (
              <YaiCard yai={yai} index={i} headingLevel={2} />
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
                {list.isFetchingNextPage ? "Loading…" : "Show more Yais"}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
