import { ErrorNotice, Loading } from "../QueryStatus.jsx";
import ui from "../../styles/ui.module.css";

/**
 * The loading, error and empty states of an admin list, then the list, then
 * "Show more" while the API has another page.
 * @param {{ query: { items: object[], isPending: boolean, error: unknown, hasNextPage?: boolean, fetchNextPage?: Function, isFetchingNextPage?: boolean }, empty: string, children: (items: object[]) => import("react").ReactNode }} props
 */
export default function QueryList({ query, empty, children }) {
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  if (query.items.length === 0) return <p className={ui.notice}>{empty}</p>;
  return (
    <>
      {children(query.items)}
      {query.hasNextPage && (
        <button
          type="button"
          className={ui.outline}
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading…" : "Show more"}
        </button>
      )}
    </>
  );
}
