<script lang="ts">
  import { page } from '$app/state'
  import { api } from '$lib/api'
  import { addToast } from '$lib/toast.svelte'
  import { playerState, roomState } from '$lib/state.svelte'
  import { getCellBackgroundClass } from '$lib/utils/color'
  import { MIN_PLAYERS } from '@tahoelink/shared'

  let roomId = $derived(page.params.roomId)
  const slots = [0, 1, 2, 3]

  // Derive lobby state
  let occupiedCount = $derived(playerState.playerIds.length)
  let isSeated = $derived(playerState.playerId !== null)
  let canStart = $derived(occupiedCount >= MIN_PLAYERS && isSeated && roomState.stage === 'waiting-for-players')

  // Per-seat state helpers (used in template)
  const isOccupied = (seatIndex: number): boolean => {
    return roomState.seats[seatIndex] !== null
  }

  const isCurrentPlayerSeat = (seatIndex: number): boolean => {
    return playerState.playerId === seatIndex
  }

  const onJoin = async (requestedPlayerId: number) => {
    try {
      const res = await api.joinRoom({
        roomId: roomId ?? '',
        playerId: requestedPlayerId,
      })
      // If the response has an error property, the join failed
      if (res.error) {
        const msg = res.error.code === 'ROOM_FULL'
          ? 'Room is full'
          : res.error.code === 'GAME_IN_PROGRESS'
            ? 'Game already in progress; you can spectate'
            : res.error.message ?? 'Failed to join room'
        addToast(msg, 'error')
        return
      }
      playerState.playerId = res.playerId
      playerState.playerIds = res.playerIds
    } catch (e) {
      addToast('Could not connect to server', 'error')
    }
  }

  const onLeave = async () => {
    const res = await api.leaveRoom({
      roomId: roomId ?? '',
    })
    playerState.playerId = null
    playerState.playerIds = res.playerIds
  }

  const onStartGame = async () => {
    await api.startGame({
      roomId: roomId ?? '',
    })
  }
</script>

<div class="flex flex-col items-center gap-6 py-4">
  <!-- Heading -->
  <h2 class="text-lg font-semibold text-gray-800">Lobby</h2>
  <p class="text-sm text-gray-500">Choose a seat to join the game</p>

  <!-- Seat cards -->
  <div class="grid grid-cols-2 gap-4 max-w-md w-full">
    {#each slots as id}
      {@const occupied = isOccupied(id)}
      {@const currentSeat = isCurrentPlayerSeat(id)}
      {@const colorClass = getCellBackgroundClass(id)}
      {@const seatLabel = occupied ? 'Occupied' : 'Empty'}

      <div
        class="rounded-lg border border-gray-300 shadow-sm overflow-hidden {colorClass}">
        <!-- Color header -->
        <div class="h-8 w-full"></div>

        <!-- Body -->
        <div class="bg-white/90 px-3 py-2">
          <div class="font-semibold text-sm">Player {id + 1}</div>

          <!-- Occupant indicator -->
          <div class="text-xs {occupied ? 'text-green-700' : 'text-gray-400'}">
            {seatLabel}
          </div>

          <!-- Join / Leave button -->
          {#if !currentSeat && !occupied}
            <button
              onclick={() => onJoin(id)}
              class="mt-1 w-full text-xs px-2 py-1 rounded bg-gray-800 text-white hover:bg-gray-700 cursor-pointer font-medium">
              Join
            </button>
          {:else if currentSeat}
            <button
              onclick={onLeave}
              class="mt-1 w-full text-xs px-2 py-1 rounded border border-red-500 text-red-600 hover:bg-red-50 cursor-pointer font-medium">
              Leave
            </button>
          {:else}
            <!-- Occupied by another player -- show disabled state -->
            <div class="mt-1 w-full text-xs px-2 py-1 rounded bg-gray-200 text-gray-400 text-center font-medium">
              Taken
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Start game button -->
  {#if isSeated}
    <div class="flex justify-center mt-2">
      <button
        onclick={onStartGame}
        disabled={!canStart}
        class="px-6 py-2 rounded font-semibold text-sm cursor-pointer
          {canStart
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'}">
        Start Game
        {#if !canStart && occupiedCount < MIN_PLAYERS}
          <span class="text-xs block">(need {MIN_PLAYERS} players)</span>
        {/if}
      </button>
    </div>
  {/if}

  <!-- Spectator count (placeholder -- server does not expose this yet) -->
  <div class="text-xs text-gray-400 mt-2">
    Spectators: <span class="font-mono">--</span>
    <!-- TODO: Replace with actual spectator count when the server exposes it via WebSocket or API -->
  </div>

  <!-- Rules link -->
  <div class="text-xs mt-4">
    <a
      href="https://www.ultraboardgames.com/tetris-link/game-rules.php"
      target="_blank"
      rel="noopener noreferrer"
      class="text-blue-600 underline hover:text-blue-800">
      View Game Rules ↗
    </a>
  </div>
</div>

<style>
  /* Hover state helper for the Leave button */
  .bg-red-50 { background-color: #fef2f2; }
</style>