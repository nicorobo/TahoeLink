<script lang="ts">
  import { playerState, roomState } from '$lib/state.svelte'
  import { getCellBackgroundClass } from '$lib/utils/color'

  const COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green']
  const PLAYER_COLORS = ['bg-red-400', 'bg-blue-400', 'bg-amber-400', 'bg-green-400']

  /**
   * Total pieces remaining for a given 1-based player ID.
   * The DO stores piecesRemaining keyed by 1-based player ID string.
   */
  function totalPieces(playerId1Based: number): number {
    const map = roomState.piecesRemaining[String(playerId1Based)]
    if (!map) return 0
    let total = 0
    for (const count of Object.values(map)) {
      total += count
    }
    return total
  }

  /** Nice label for a dice value. */
  function dieLabel(roll: string): string {
    if (roll === 'any') return '⭐'
    return roll
  }
</script>

<div class="flex flex-col gap-2 border border-gray-300 rounded p-2 bg-gray-50 text-sm">
  <div aria-live="polite" aria-atomic="true">
    <!-- Die result + active player row -->
    <div class="flex items-center gap-3">
      <!-- Die result -->
      <div class="flex flex-col items-center gap-0.5 min-w-[3rem]">
        <span class="text-[10px] text-gray-500 uppercase tracking-wide">Roll</span>
        <span class="text-2xl font-bold tracking-wider leading-none">{dieLabel(roomState.roll)}</span>
      </div>

      <!-- Active player -->
      <div class="flex flex-col gap-0.5">
        <div class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-full {PLAYER_COLORS[Math.min(roomState.activePlayer, 3)]}"></span>
          <span class="font-semibold text-xs uppercase text-gray-500">Turn</span>
        </div>
        <span class="font-medium">Player {roomState.activePlayer + 1}</span>
      </div>

      <!-- "Your turn!" indicator -->
      {#if roomState.activePlayer === playerState.playerId && roomState.stage === 'in-progress'}
        <div class="motion-reduce:animate-none animate-pulse text-green-600 font-bold text-xs">
          Your turn!
        </div>
      {/if}
    </div>

    <!-- Game over banner -->
    {#if roomState.stage === 'complete'}
      <div class="border-t border-gray-200 pt-1 mt-1">
        {#if roomState.winner !== null && roomState.winner >= 0}
          <span class="font-bold text-sm">
            <span class="inline-block w-3 h-3 rounded-full {PLAYER_COLORS[Math.min(roomState.winner, 3)]}"></span>
            Player {roomState.winner + 1} wins!
          </span>
        {:else if roomState.winner === -1}
          <span class="font-bold text-sm">Tie game!</span>
        {:else}
          <span class="font-bold text-sm">Game over</span>
        {/if}
      </div>
    {/if}

    <!-- Scores table -->
    <div class="border-t border-gray-200 pt-1 mt-1">
      <span class="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Scores</span>
      <div class="flex flex-col gap-0.5 mt-0.5">
        {#each roomState.seats as seat, seatIdx}
          {@const pid = seatIdx + 1}
          {@const score = roomState.scores[pid] ?? 0}
          {#if seat !== null}
            <div class="flex items-center gap-2">
              <span class="inline-block w-3 h-3 rounded-full {PLAYER_COLORS[Math.min(seatIdx, 3)]}"></span>
              <span class="font-medium">P{pid}</span>
              <span class="font-mono text-xs">{score} pts</span>
              <span class="text-[10px] text-gray-400 ml-1">({totalPieces(pid)} left)</span>
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Color legend -->
    <div class="border-t border-gray-200 pt-1 mt-1">
      <span class="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Colors</span>
      <div class="flex flex-wrap gap-1 mt-0.5">
        {#each COLOR_NAMES as name, idx}
          <span class="flex items-center gap-1 text-[10px]">
            <span class="inline-block w-2.5 h-2.5 rounded-full {PLAYER_COLORS[Math.min(idx, 3)]}"></span>
            <span>P{idx + 1} = {name}</span>
          </span>
        {/each}
      </div>
    </div>
  </div>
</div>