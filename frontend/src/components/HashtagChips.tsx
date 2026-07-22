import { Link } from "react-router-dom";

/** Renders a task's hashtags as links into the global search's cross-dashboard tag view. */
export function HashtagChips({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return <>—</>;
  return (
    <>
      {tags.map((tag, i) => (
        <span key={tag}>
          <Link to={`/search?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>
          {i < tags.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}
