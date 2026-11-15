import { useEffect, useState } from "react";
import PageTitle from "../../components/PageTitle.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { FAQ_GROUPS, faqAnchor, useFaq } from "../../lib/catalog.js";
import ui from "../../styles/ui.module.css";
import ex from "../../styles/explore.module.css";
import styles from "./HelpFaq.module.css";

/**
 * Marks the topic whose answers are at the top of the screen, so the list on
 * the left follows the reader.
 */
function useCurrentGroup(ids) {
  const [current, setCurrent] = useState(null);
  const key = ids.join(",");

  useEffect(() => {
    const sections = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (sections.length === 0) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.find((e) => e.isIntersecting);
        if (seen) setCurrent(seen.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [key]);

  return current;
}

/** Figma 17 Help and FAQ: the questions from GET /catalog/faq. */
export default function HelpFaq() {
  const faq = useFaq();
  const groups = FAQ_GROUPS.map(([id, title]) => ({
    id,
    title,
    anchor: faqAnchor(id),
    items: faq.data?.groups.find((g) => g.id === id)?.items ?? [],
  })).filter((g) => g.items.length > 0);
  const current = useCurrentGroup(groups.map((g) => g.anchor));
  const active = current ?? groups[0]?.anchor;

  return (
    <div className={`${ex.section} ${styles.page}`}>
      <div className={ex.inner}>
        <PageTitle main="How can we" script="help?" />
        <p className={styles.lead}>
          Answers for guests, and for families signing up a Yai.
        </p>

        <div className={styles.layout}>
          <aside className={styles.side}>
            {groups.length > 0 && (
              <nav aria-label="Topics">
                <ul className={styles.topics}>
                  {groups.map((g) => (
                    <li key={g.id}>
                      <a
                        href={`#${g.anchor}`}
                        className={styles.topic}
                        aria-current={g.anchor === active ? "true" : undefined}
                      >
                        {g.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className={styles.stillNeed}>
              <h2 className={styles.stillNeedTitle}>Still need help?</h2>
              <p className={ui.body}>
                Contact details will be added before the pilot starts.
              </p>
            </div>
          </aside>

          <div className={styles.answers}>
            {faq.isPending && <Loading label="Loading answers…" />}
            {faq.isError && <ErrorNotice error={faq.error} />}
            {faq.isSuccess && groups.length === 0 && (
              <p className={ui.notice}>Answers will be here soon.</p>
            )}
            {groups.map((g) => (
              <section
                key={g.id}
                id={g.anchor}
                className={styles.group}
                aria-labelledby={`${g.anchor}-title`}
              >
                <h2 id={`${g.anchor}-title`} className={styles.groupTitle}>
                  {g.title}
                </h2>
                <dl className={styles.items}>
                  {g.items.map((item) => (
                    <div key={item.question} className={styles.item}>
                      <dt className={styles.question}>{item.question}</dt>
                      <dd className={styles.answer}>{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
