import type { Artwork } from "../lib/db";

type Nav = (s: "wall" | "studio" | "arena" | "auth", screen: string, param?: string) => void;

export function SavedPage({
  artworks,
  savedIds,
  onUnsave,
  navigate,
}: {
  artworks: Artwork[];
  savedIds: string[];
  onUnsave: (id: string) => void;
  navigate: Nav;
}) {
  const saved = artworks.filter((w) => savedIds.includes(w.id));

  return (
    <main className="page wall">
      <div className="wall__intro">
        <span className="kicker">My collection</span>
        <h1>Saved<br /><em>works.</em></h1>
        <p>Everything you've bookmarked from The Wall.</p>
      </div>

      {saved.length === 0 ? (
        <div className="state state--empty">
          <p className="state__message">Nothing saved yet.</p>
          <button className="button button--outline" onClick={() => navigate("wall", "grid")}>
            Browse the Wall
          </button>
        </div>
      ) : (
        <div className="wall-grid">
          {saved.map((work) => (
            <div key={work.id} className="artwork-cell artwork-cell--static">
              <button
                className="artwork-cell__mat"
                onClick={() => navigate("wall", "detail", work.id)}
                style={{ border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
              >
                <img src={work.image} alt={work.title} />
              </button>
              <div className="artwork-cell__meta">
                <strong>{work.title}</strong>
                <span>{work.artistName}</span>
              </div>
              <button
                className="artwork-cell__unsave"
                onClick={() => onUnsave(work.id)}
                aria-label={`Remove ${work.title} from saved`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}