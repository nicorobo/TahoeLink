# Tetris Link — Game Rules

> Source: [Ultra BoardGames — Tetris Link Rules](https://www.ultraboardgames.com/tetris-link/game-rules.php)
>
> This document is the canonical reference for the digital implementation. Deviations from
> the physical rules must be recorded in [PLAN.md](./PLAN.md) decisions log.

---

## 1. Components

| Component | Count | Notes |
|---|---|---|
| Game Tower (board) | 1 | 10×10 grid? — confirm physical dimensions |
| Tetriminos (game pieces) | 100 | 25 per colour, 5 of each shape per colour |
| Detachable Feet | 2 | For the physical tower base |
| Playing Die | 1 | 6 sides; 5 shapes + 1 TETRIS LINK face |
| Instructions | 1 | — |

## 2. Colours and shapes

- **Colours**: Each player chooses one colour. The game supports 2–4 players.
- **Tetrimino shapes**: Each colour set contains 25 pieces — **5 copies of each of the 5
  shapes**. The shapes (standard tetrominoes) are:
  - **I** (4×1 line)
  - **O** (2×2 square)
  - **T** (T-shape)
  - **L** (L-shape)
  - **S/Z** (S-shape / Z-shape — treated as one die face)
- **Die faces**: The 6-sided die has those 5 shapes plus one face showing the **TETRIS LINK
  logo** (a wild).

## 3. Object of the game

> Link Tetriminos of the same colour into groups of **3 or more** to earn points. Block
> opponents from linking their Tetriminos. When the tower is full, the player with the
> highest score wins.

## 4. Setup

1. Each player chooses a colour and takes all 25 Tetriminos of that colour.
2. The die is placed in reach.
3. The first player to **roll TETRIS LINK** (the logo face) goes first.

## 5. Turn sequence

1. **Roll the die** — the result determines which Tetrimino must be played.
2. **Select** a matching Tetrimino from your colour set (if available).
3. **Drop** it into the tower in any open space, in any orientation.
4. **Score** — add points for new links of 3+, subtract points for empty spaces left beneath
   your piece.
5. Pass the die to the next player (clockwise / join-order).

## 6. Rules of the die

| Roll | Action |
|---|---|
| A shape (I/O/T/L/S/Z) | Must play that exact shape from your set. |
| TETRIS LINK (logo) | May play **any** shape from your set. |
| Shape you no longer have | Turn is **skipped** (no piece to play). |
| Shape that will not fit completely in the tower | Turn is **skipped** (tower nearly full). |

> **First-turn penalty**: If the starting player rolls the S/Z face on their first turn,
> they begin the game with a **negative score** (the empty space penalty applies).

## 7. Placement rules

### 7.1. Orientation

Tetriminos can be rotated and dropped in any direction. The physical rules place no
restriction on rotation or flipping.

### 7.2. Gravity

Pieces fall to the lowest available position in each column they occupy. If a player leaves
an **empty space directly beneath** any part of their placed Tetrimino, they lose points (see
§ 10.2).

### 7.3. Bounds

Pieces must fit completely inside the tower. No part may stick out above the top. If the
rolled shape cannot be placed entirely within the tower, the turn is skipped.

### 7.4. Column-major board model

The digital representation uses a **column-major** coordinate system (consistent with the
existing engine):

- `board[x][y]`: `x=0` is the leftmost column, `y=0` is the top row.
- Empty cells are `-1`. Occupied cells encode the owner (player colour/seat index).
- Shapes are also column-major: `shape[x][y]` with `1` = block, `0` = empty.
- Each column in a given orientation has equal length (the shape matrix is rectangular).

## 8. Linking

### 8.1. What counts as a link

- Tetriminos of the **same colour** that are **orthogonally adjacent** (up, down, left,
  right) are linked.
- **Diagonal adjacency does not count**.
- A **group** is the maximal connected component (via orthogonal adjacency) of same-colour
  pieces.

### 8.2. Scoring threshold

Only groups of **3 or more** pieces score points. Groups of 1 or 2 are worth nothing.

### 8.3. Multiple groups

A player may have several disconnected groups on the board at once. They can build off any
group on subsequent turns. Only groups that reach 3+ pieces score.

### 8.4. When blocked pieces go out of play

If a player's group is surrounded (by opponent pieces, the board edge, or a combination)
such that no further link can be made, those pieces are **blocked and out of play**. The
player must start a new colour group to resume scoring.

## 9. Blocking

Players may place their pieces adjacent to opponents' pieces. This prevents the opponent
from linking further in that area. Strategic blocking is an explicit part of the rules.

## 10. Scoring

### 10.1. Earning points

| Event | Points |
|---|---|
| First 3 linked pieces in a new group | +3 (1 per piece) |
| Each additional piece added to an existing group of 3+ | +1 |
| Merging two groups (neither previously scored) | +1 per piece that becomes part of the resultant group of 3+ |
| Merging a scored group with an unscored group | +1 for each unscored piece that joins the scored group (do not double-count already-scored pieces) |

> **Key principle**: No piece is scored twice. When groups merge, only count pieces that
> were **not previously added to the player's score**.

### 10.2. Losing points (empty spaces)

| Condition | Penalty |
|---|---|
| 1 empty space directly beneath any part of the placed Tetrimino | −1 |
| 2 or more empty spaces directly beneath the placed Tetrimino | −2 (max per turn) |

> **Never lose more than 2 points per turn** for empty spaces, regardless of how many gaps
> are created.

### 10.3. Combined positive and negative

A single turn may both create a link (gain points) and leave an empty space (lose points).
Both are accounted: net score change = links gained − empty-space penalty.

### 10.4. First-turn special case

If the starting player rolls S/Z, the empty-space penalty applies immediately — they begin
with a negative score.

### 10.5. Score tracking

In the physical game, score markers slide up/down rails on the tower sides. In the digital
version, score is tracked per player and displayed in the UI.

## 11. End of game

### 11.1. Termination condition

The game ends when **no more pieces can be added** — the tower is full and every Tetrimino
placed would cause overhang above the top row.

### 11.2. Winner

The player with the **highest score** wins.

### 11.3. Tie-breaker

In the event of a tie, the player with the **longest single group** (most same-colour pieces
linked orthogonally in any direction) wins. If still tied, the rules do not specify a further
tie-breaker.

## 12. 2-player and 3-player variants

- **Rules are identical** to the 4-player game.
- **2-player special rule**: Both players may share a single colour set — there are enough
  pieces (25) for two players using one colour.

## 13. Mapped implementation requirements

| Rule | Status | Location |
|---|---|---|
| 2–4 players | ✅ Existing room model supports 2–4 | `packages/shared/src/constants.ts` |
| 5 Tetrimino shapes (I, O, T, L, S/Z) | ✅ Shapes defined | `packages/shared/src/game-mechanics/shapes.ts` |
| Column-major board (10×10) | ✅ Existing | `packages/shared/src/constants.ts` |
| Column-major shape encoding | ✅ Existing | `packages/shared/src/game-mechanics/shapes.ts` |
| Gravity (fall to lowest row) | ✅ `getUpdatedBoard` | `packages/shared/src/game-mechanics/board.ts` |
| Die roll / TETRIS LINK wild | ❌ Not implemented | `packages/api/src/main.ts:96-118` |
| Turn ownership enforcement | ❌ Not implemented | `packages/api/src/main.ts:96-118` |
| Shape-matching validation | ❌ Not implemented | `packages/api/src/main.ts:96-118` |
| Link detection & scoring | ❌ Not implemented | `shared` engine, `api` turn handler |
| Empty-space penalty | ❌ Not implemented | `shared` engine, `api` turn handler |
| "Will it fit?" check | ❌ Not implemented | `shared` engine, `api` turn handler |
| Skip turn if no matching piece | ❌ Not implemented | `api/src/main.ts` |
| Skip turn if piece won't fit | ❌ Not implemented | `api/src/main.ts` |
| Blocked-group detection | ❌ Not implemented | `shared` engine |
| End-game detection (tower full) | ❌ Not implemented | `api` or `shared` |
| Tie-breaker (longest link) | ❌ Not implemented | `shared` engine |
| 2-player single-colour mode | ❌ Not implemented | room join / setup |
| Atomic room mutations | ❌ Not implemented | `packages/api/src/models/room.ts` |
| Wire types in `shared/src/events.ts` | ⚠️ Two mismatches exist | `packages/shared/src/events.ts` |

## 14. Resolved questions

These were flagged during initial extraction and confirmed by the author.

| # | Question | Answer |
|---|----------|--------|
| 1 | Board dimensions | **10×10** — confirmed. The existing `BOARD_WIDTH=10`, `BOARD_HEIGHT=10` in `constants.ts` is correct. |
| 2 | S/Z combined die face, orientation choice | The player may rotate or flip **any way they choose**. The S/Z die face means the player can drop either the S or Z shape (or either after rotation). Since players are free to rotate/flip arbitrarily (answer 4), the die just restricts *which shape family* to pick. |
| 3 | Die face distribution | 5 shapes, 6 die faces: I, O, T, L, S/Z (combined face), TETRIS LINK. The S/Z are one entry on the die because the physical piece can be flipped to produce either orientation. |
| 4 | Allowed orientations | **Any rotation and flipping** is permitted. The existing `shapes.ts` rotation/flip data is correct. The game does not restrict beyond standard tetromino geometry. |
| 5 | Tie-breaker definition | The longest colour link = **the largest connected component** (most same-colour pieces orthogonally adjacent). Not a chain/path — count the whole group.