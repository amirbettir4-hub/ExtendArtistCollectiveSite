import { useEffect, useState } from "react";
import {
  loadArtists, loadArtistById, loadArtworksByUser,
  saveArtistProfile, loadPendingArtists, setArtistStatus,
  deleteArtwork,
  type Artist, type Artwork,
} from "../lib/db";
import type { User } from "../store";

/* =========================================================
   Shared
========================================================= */

function StateBlock({ kind, message }: {
  kind: "empty" | "loading" | "error";
  message: string;
}) {
  return (
    <div className={`state state--${kind}`}>
      <p className="state__message">{message}</p>
    </div>
  );
}

type Nav = (s: "wall" | "studio" | "arena" | "auth", screen: string, param?: string) => void;

/* =========================================================
   ARTIST DIRECTORY
========================================================= */

export function ArtistDirectory({ navigate }: { navigate: Nav }) {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArtists().then((rows) => {
      setArtists(rows);
      setLoading(false);
    });
  }, []);

  return (
    <main className="page artists">
      <div className="artists__intro">
        <span className="kicker">Artists</span>
        <h1>{artists.length === 0 ? "No artists yet." : `${artists.length} voice${artists.length === 1 ? "" : "s"}.`}</h1>
      </div>

      {loading && <StateBlock kind="loading" message="Loading artists…" />}

      {!loading && artists.length === 0 && (
        <StateBlock kind="empty" message="No approved artists yet. Apply to be the first." />
      )}

      {!loading && artists.length > 0 && (
        <div className="artist-directory-grid">
          {artists.map((a) => (
            <button
              key={a.id}
              className="artist-card"
              onClick={() => navigate("studio", `room/${a.id}`)}
            >
              {a.avatar ? (
                <img src={a.avatar} alt={a.name} />
              ) : (
                <div className="artist-card__fallback">{a.name.slice(0, 1)}</div>
              )}
              <strong>{a.name}</strong>
              <span>
                {[a.medium, a.location].filter(Boolean).join(" · ") || "Artist"}
              </span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

/* =========================================================
   ARTIST ROOM
========================================================= */

export function ArtistRoom({
  artistId,
  user,
  myArtist,
  navigate,
}: {
  artistId: string;
  user: User | null;
  myArtist: Artist | null;
  navigate: Nav;
}) {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [works, setWorks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"works" | "about">("works");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = async (a: Artist) => {
    const w = await loadArtworksByUser(a.userId);
    setWorks(w);
  };

  useEffect(() => {
    setLoading(true);
    loadArtistById(artistId).then(async (a) => {
      setArtist(a);
      if (a) await reload(a);
      setLoading(false);
    });
  }, [artistId]);

  if (loading) {
    return <main className="page"><StateBlock kind="loading" message="Loading room…" /></main>;
  }

  if (!artist) {
    return (
      <main className="page">
        <StateBlock kind="error" message="Artist not found." />
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <button className="button button--outline" onClick={() => navigate("wall", "artists")}>
            Back to artists
          </button>
        </div>
      </main>
    );
  }

  const isMine = myArtist?.id === artist.id;
  void user;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this work? This can't be undone.")) return;
    setDeletingId(id);
    const ok = await deleteArtwork(id);
    setDeletingId(null);
    if (ok) {
      setWorks((prev) => prev.filter((w) => w.id !== id));
    } else {
      alert("Could not delete. Try again.");
    }
  };

  return (
    <main className="room page">
      <div className="room__profile">
        {artist.avatar ? (
          <img src={artist.avatar} alt={artist.name} />
        ) : (
          <div className="artist-card__fallback artist-card__fallback--big">
            {artist.name.slice(0, 1)}
          </div>
        )}
        <div>
          <span className="kicker">
            Artist room
            {[artist.medium, artist.location].filter(Boolean).length > 0
              ? ` · ${[artist.medium, artist.location].filter(Boolean).join(" · ")}`
              : ""}
          </span>
          <h1>{artist.name}</h1>
          <p>{artist.bio || "No bio yet."}</p>
        </div>
        {artist.website && (
          <a href={artist.website} target="_blank" rel="noreferrer" className="button button--outline">
            Visit website
          </a>
        )}
      </div>

      <nav className="room-tabs">
        <button className={tab === "works" ? "active" : ""} onClick={() => setTab("works")}>
          Works <span>{works.length}</span>
        </button>
        <button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>
          About
        </button>
      </nav>

      {tab === "works" && (
        <>
          {works.length === 0 ? (
            <StateBlock kind="empty" message={isMine ? "You haven't listed any works yet." : "No works listed yet."} />
          ) : (
            <div className="process-grid">
              {works.map((w) => (
                <article key={w.id}>
                  <img src={w.image} alt={w.title} />
                  <div className="room-work__meta">
                    <div>
                      <span>{w.medium}</span>
                      <strong>{w.title}</strong>
                    </div>
                    {isMine && (
                      <button
                        className="room-work__delete"
                        onClick={() => handleDelete(w.id)}
                        disabled={deletingId === w.id}
                        aria-label={`Delete ${w.title}`}
                      >
                        {deletingId === w.id ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {isMine && works.length === 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <button className="button" onClick={() => navigate("studio", "composer")}>
                List a work
              </button>
            </div>
          )}
        </>
      )}

      {tab === "about" && (
        <div className="room-about">
          <p>{artist.bio || "No bio yet."}</p>
          <dl>
            {artist.location && (
              <div><dt>Location</dt><dd>{artist.location}</dd></div>
            )}
            {artist.medium && (
              <div><dt>Medium</dt><dd>{artist.medium}</dd></div>
            )}
            {artist.website && (
              <div>
                <dt>Website</dt>
                <dd><a href={artist.website} target="_blank" rel="noreferrer">{artist.website}</a></dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {isMine && (
        <div style={{ marginTop: "2rem" }}>
          <button className="button button--outline" onClick={() => navigate("studio", "apply")}>
            Edit my profile
          </button>
        </div>
      )}
    </main>
  );
}

/* =========================================================
   APPLY / EDIT PROFILE
========================================================= */

export function ArtistApply({
  user,
  navigate,
}: {
  user: User | null;
  navigate: Nav;
}) {
  const [existing, setExisting] = useState<Artist | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [medium, setMedium] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    import("../lib/supabase").then(({ supabase }) => {
      if (!supabase) return;
      supabase.auth.getUser().then(({ data }) => {
        const uid = data.user?.id;
        if (!uid) { setLoaded(true); return; }
        import("../lib/db").then(({ loadMyArtist }) => {
          loadMyArtist(uid).then((a) => {
            if (a) {
              setExisting(a);
              setName(a.name);
              setLocation(a.location);
              setMedium(a.medium);
              setBio(a.bio);
              setWebsite(a.website);
              setAvatar(a.avatar || null);
            } else {
              setName(user.name || user.email!.split("@")[0]);
            }
            setLoaded(true);
          });
        });
      });
    });
  }, [user]);

  if (!user) {
    return (
      <main className="page">
        <StateBlock kind="empty" message="Sign in to apply." />
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <button className="button button--outline" onClick={() => navigate("auth", "signin")}>
            Sign in
          </button>
        </div>
      </main>
    );
  }

  const pickAvatar = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const submit = async () => {
    if (!name.trim() || !bio.trim()) {
      setError("Name and bio are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const { supabase } = await import("../lib/supabase");
    const { data: userData } = await supabase!.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setBusy(false); setError("Session lost. Sign in again."); return; }

    const profile = { name: name.trim(), location, medium, bio, website, avatar: existing?.avatar || "" };
    const avatarDataUrl = avatar && avatar.startsWith("data:") ? avatar : null;
    const result = await saveArtistProfile(uid, profile, avatarDataUrl);
    setBusy(false);
    if (!result) { setError("Could not save. Try again."); return; }
    setExisting(result);
  };

  if (!loaded) {
    return <main className="page"><StateBlock kind="loading" message="Loading…" /></main>;
  }

  const isPending = existing?.status === "pending";
  const isApproved = existing?.status === "approved";
  const isRejected = existing?.status === "rejected";

  return (
    <main className="composer page">
      <div className="composer__heading">
        <span className="kicker">{existing ? "Artist profile" : "Apply to join"}</span>
        <h1>
          {isApproved ? "Your artist profile." :
           isPending ? "Application under review." :
           isRejected ? "Application declined." :
           <>Join the<br /><em>collective.</em></>}
        </h1>
      </div>

      {isPending && (
        <div className="apply-status apply-status--pending">
          Your application is being reviewed. You'll be notified when it's approved.
        </div>
      )}

      {isApproved && (
        <div className="apply-status apply-status--approved">
          You're approved. Your work shows on The Wall and in your room.
        </div>
      )}

      {isRejected && (
        <div className="apply-status apply-status--rejected">
          Your application was declined. You can update and reapply below.
        </div>
      )}

      <div className="composer__layout">
        <section className="upload-zone" onClick={pickAvatar} style={{ cursor: "pointer" }}>
          {avatar ? (
            <img src={avatar} alt="Avatar preview" style={{ maxHeight: "18rem", borderRadius: "50%", width: "12rem", height: "12rem", objectFit: "cover" }} />
          ) : (
            <>
              <div className="icon-placeholder">
                <span>{name ? name.slice(0, 1) : "?"}</span>
              </div>
              <h2>Add a photo</h2>
              <p>Click to upload a portrait.</p>
            </>
          )}
        </section>

        <section className="composer-form">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your artist name" /></label>
          <label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. London" /></label>
          <label>Medium<input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="e.g. Oil on linen" /></label>
          <label>Website<input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" /></label>
          <label>Bio<textarea rows={5} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Two sentences about your work." /></label>

          {error && <p className="auth__error">{error}</p>}

          <div className="composer-form__footer">
            <span>{existing ? "Updates your public profile." : "Submits your application for review."}</span>
            <button className="button" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : existing ? "Save profile" : "Submit application"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   ADMIN PANEL
========================================================= */

export function AdminPanel({ user }: { user: User | null }) {
  const [pending, setPending] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    loadPendingArtists().then((rows) => {
      setPending(rows);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  if (!user) {
    return <main className="page"><StateBlock kind="empty" message="Sign in to view the admin panel." /></main>;
  }

  const approve = async (id: string) => {
    await setArtistStatus(id, "approved");
    refresh();
  };

  const reject = async (id: string) => {
    await setArtistStatus(id, "rejected");
    refresh();
  };

  return (
    <main className="page">
      <div className="artists__intro">
        <span className="kicker">Admin</span>
        <h1>Pending applications.</h1>
      </div>

      {loading && <StateBlock kind="loading" message="Loading…" />}

      {!loading && pending.length === 0 && (
        <StateBlock kind="empty" message="No pending applications." />
      )}

      {!loading && pending.length > 0 && (
        <div className="admin-list">
          {pending.map((a) => (
            <article key={a.id} className="admin-card">
              <div className="admin-card__head">
                {a.avatar ? (
                  <img src={a.avatar} alt={a.name} />
                ) : (
                  <div className="artist-card__fallback">{a.name.slice(0, 1)}</div>
                )}
                <div>
                  <strong>{a.name}</strong>
                  <span>{[a.medium, a.location].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
              <p>{a.bio}</p>
              {a.website && (
                <a href={a.website} target="_blank" rel="noreferrer" className="admin-card__link">
                  {a.website}
                </a>
              )}
              <div className="admin-card__actions">
                <button className="button" onClick={() => approve(a.id)}>Approve</button>
                <button className="button button--outline" onClick={() => reject(a.id)}>Reject</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}