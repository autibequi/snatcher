CREATE TABLE taxonomy_node (
    id            BIGSERIAL PRIMARY KEY,
    parent_id     BIGINT REFERENCES taxonomy_node(id) ON DELETE CASCADE,
    slug          TEXT NOT NULL,
    name_pt       TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'category',  -- 'brand' | 'category' | 'subcategory' | 'attribute'
    confidence_pct INT NOT NULL DEFAULT 100,
    UNIQUE (parent_id, slug)
);

CREATE INDEX idx_taxonomy_node_parent ON taxonomy_node(parent_id);
CREATE INDEX idx_taxonomy_node_kind ON taxonomy_node(kind);

CREATE TABLE taxonomy_feedback (
    id             BIGSERIAL PRIMARY KEY,
    node_id        BIGINT NOT NULL REFERENCES taxonomy_node(id) ON DELETE CASCADE,
    channel_id     BIGINT,
    feedback_type  TEXT NOT NULL CHECK (feedback_type IN ('approved','rejected','reassigned')),
    reassigned_to  BIGINT REFERENCES taxonomy_node(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_taxonomy_feedback_node ON taxonomy_feedback(node_id, created_at DESC);
