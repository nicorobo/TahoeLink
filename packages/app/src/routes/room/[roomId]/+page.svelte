<script lang="ts">
  import { api } from '$lib/api'
  import { page } from '$app/state'
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { pieceState, playerState, roomState } from '$lib/state.svelte'
  import { eventHandlers } from '$lib/events'
  import PlayerSelectionScreen from '$lib/components/PlayerSelectionScreen.svelte'
  import Board from '$lib/components/Board.svelte'
  import PieceDisplay from '$lib/components/PieceDisplay.svelte'
  import PieceControl from '$lib/components/PieceControl.svelte'
  import StatusPanel from '$lib/components/StatusPanel.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import { getShape, getLegalColumns, legalShapesForDie } from '@tahoelink/shared'

  let roomId = $derived(page.params.roomId)
  let adjustedRotation = $derived(((pieceState.rotation % 4) + 4) % 4)
  let currentShape = $derived(getShape({ shape: pieceState.shape, rotation: adjustedRotation, flip: pieceState.flip }))
  let legalCols = $derived(getLegalColumns(roomState.board, currentShape))
  let legalShapes = $derived(legalShapesForDie(roomState.roll))
  const { data } = $props()

  let loadError = $state(data.loadError ?? false)
  let loadErrorMessage = $state(data.loadErrorMessage ?? '')
  let copied = $state(false)
  let connectionStatus = $state<'connected' | 'disconnected' | 'reconnecting'>('disconnected')

  $effect(() => {
    // If there's a load error or no room data, skip populating room state
    if (data.loadError || !data.room) {
      loadError = true
      loadErrorMessage = data.loadErrorMessage ?? 'Room not found'
      return
    }
    loadError = false
    roomState.roll = data.room.roll
    roomState.turn = data.room.turn
    roomState.board = data.room.board
    roomState.stage = data.room.stage
    roomState.activePlayer = data.room.activePlayer
    roomState.seats = data.seats!
    roomState.scores = data.scores ?? {}
    roomState.winner = data.winner ?? null
    roomState.piecesRemaining = data.piecesRemaining ?? {}
    playerState.playerId = data.playerId!
    playerState.playerIds = data.playerIds!
  })

  const makeMove = async (column: number) => {
    const res = await api.makeMove({
      roomId: roomId ?? '',
      column,
      shape: pieceState.shape,
      rotation: pieceState.rotation,
      flip: pieceState.flip,
    })
    roomState.roll = res.roll
    roomState.turn = res.turn
    roomState.board = res.board
    roomState.stage = res.stage
    roomState.activePlayer = res.activePlayer
  }

  const onCreateNewRoom = async () => {
    const { roomId: newRoomId } = await api.createRoom()
    goto(`/room/${newRoomId}`)
  }

  const onLeave = async () => {
    const res = await api.leaveRoom({
      roomId: roomId ?? '',
    })
    playerState.playerId = null
    playerState.playerIds = res.playerIds
  }

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      copied = true
      setTimeout(() => { copied = false }, 2000)
    } catch (e) {
      console.error('Failed to copy link:', e)
    }
  }

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const connectWebSocket = () => {
    if (!roomId) return
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/room/${roomId}`
    
    ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      connectionStatus = 'connected'
      console.log('WebSocket connected to room', roomId)
    }
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      const handler = eventHandlers[msg.event as keyof typeof eventHandlers]
      if (handler) {
        handler(msg.data)
      } else {
        console.log('Unknown event:', msg.event)
      }
    }
    
    ws.onclose = () => {
      connectionStatus = 'disconnected'
      console.log('WebSocket disconnected from room', roomId)
      reconnectTimer = setTimeout(() => {
        connectionStatus = 'reconnecting'
        connectWebSocket()
      }, 3000)
    }
    
    ws.onerror = () => {
      connectionStatus = 'reconnecting'
      console.error('WebSocket error for room', roomId)
    }
  }

  onMount(() => {
    connectWebSocket()
  })

  onDestroy(() => {
    if (ws) {
      ws.close()
      ws = null
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  })
</script>

<!-- Toasts -->
<Toast />

{#if loadError}
  <div class="flex flex-col items-center gap-4 py-16">
    <h1 class="text-2xl font-bold">Room Not Found</h1>
    <p class="text-gray-500">{loadErrorMessage} — this room doesn't exist or has expired.</p>
    <div class="flex gap-3">
      <a href="/" class="px-4 py-2 rounded-lg bg-gray-800 text-white font-semibold hover:bg-gray-700 text-sm">Home</a>
      <button
        onclick={onCreateNewRoom}
        class="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 text-sm cursor-pointer">
        Create New Room
      </button>
    </div>
  </div>
{:else}

<!-- Room header bar -->
<div class="flex items-center justify-between gap-4 px-4 py-2 border-b border-gray-300 bg-gray-50">
  <!-- Home link -->
  <a href="/" class="text-sm font-medium hover:underline">&larr; Home</a>

  <!-- Room code + copy link -->
  <div class="flex items-center gap-2">
    <span class="font-mono font-bold text-sm tracking-wider">{roomId ?? ''}</span>

    <button
      onclick={copyInviteLink}
      class="text-xs px-2 py-1 rounded border border-gray-400 hover:bg-gray-100 cursor-pointer"
      title="Copy invite link to clipboard">
      {#if copied}
        <span class="text-green-600">Copied!</span>
      {:else}
        Copy Link
      {/if}
    </button>
  </div>

  <!-- Connection status indicator -->
  <div class="flex items-center gap-1.5">
    {#if connectionStatus === 'connected'}
      <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
      <span class="text-xs text-green-700">Connected</span>
    {:else if connectionStatus === 'reconnecting'}
      <span class="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
      <span class="text-xs text-yellow-700">Reconnecting&hellip;</span>
    {:else}
      <span class="inline-block w-2 h-2 rounded-full bg-red-500"></span>
      <span class="text-xs text-red-700">Disconnected</span>
    {/if}
  </div>
</div>

{#if roomState.stage === 'waiting-for-players'}
  <PlayerSelectionScreen />
{:else if roomState.stage === 'in-progress' || roomState.stage === 'paused' || roomState.stage === 'complete'}
  <div class="flex flex-col md:flex-row gap-2 md:gap-4 p-2 md:p-4 items-start max-w-full">
    <!-- Board -->
    <Board board={roomState.board} shape={currentShape} legalColumns={legalCols} playerId={playerState.playerId} onClick={(col: number) => makeMove(col)} />

    <!-- Control panel -->
    <div class="flex flex-col gap-2 md:gap-4">
      <!-- Status panel (die, active player, scores, legend) -->
      <StatusPanel />

      <!-- Current piece -->
      <PieceDisplay playerId={playerState.playerId ?? 0} />

      <!-- Piece controls (only for seated players) -->
      {#if playerState.playerId !== null}
        <PieceControl {legalShapes} />
      {:else}
        <p class="text-sm text-gray-500 italic">Spectating — join a seat to play</p>
      {/if}

      <!-- Leave button -->
      <div class="flex items-center gap-2 text-sm mt-2">
        {#if playerState.playerId !== null}
          <span class="font-medium">You are Player {playerState.playerId + 1}</span>
          <button
            onclick={onLeave}
            class="text-xs px-2 py-1 rounded border border-gray-400 hover:bg-gray-100 cursor-pointer">
            Leave
          </button>
        {:else}
          <span class="text-gray-500">Spectator</span>
        {/if}
      </div>
    </div>
  </div>

  {#if roomState.stage === 'paused'}
    <!-- Paused overlay -->
    <div class="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
      <div class="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <div class="flex items-center justify-center gap-3 mb-4">
          <span class="text-4xl">⏸</span>
          <h2 class="text-2xl font-bold">Game Paused</h2>
        </div>
        <p class="text-gray-600 mb-4">
          A player has disconnected. Waiting for them to rejoin&hellip;
        </p>

        <!-- Empty seats indicator -->
        {#each roomState.seats as seat, seatIdx}
          {#if seat === null}
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="inline-block w-2 h-2 rounded-full bg-gray-300"></span>
              <span>Player {seatIdx + 1} — disconnected</span>
            </div>
          {:else}
            <div class="flex items-center gap-2 text-sm text-green-700">
              <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
              <span>Player {seatIdx + 1} — connected</span>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {:else if roomState.stage === 'complete'}
    <!-- Winner / Game Over overlay -->
    <div class="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
      <div class="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <h2 class="text-2xl font-bold mb-4">Game Over!</h2>

        {#if roomState.winner !== null && roomState.winner >= 0}
          <div class="flex items-center justify-center gap-2 mb-4">
            <span class="inline-block w-5 h-5 rounded-full {['bg-red-400', 'bg-blue-400', 'bg-amber-400', 'bg-green-400'][Math.min(roomState.winner, 3)]}"></span>
            <span class="text-xl font-semibold">Player {roomState.winner + 1} wins!</span>
          </div>
        {:else if roomState.winner === -1}
          <p class="text-xl font-semibold mb-4">It's a tie!</p>
        {:else}
          <p class="text-xl font-semibold mb-4">Game Over</p>
        {/if}

        <!-- Final scores -->
        <div class="border-t border-gray-200 pt-3 mt-2 mb-4">
          <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Final Scores</p>
          {#each roomState.seats as seat, seatIdx}
            {@const pid = seatIdx + 1}
            {@const score = roomState.scores[pid] ?? 0}
            {#if seat !== null}
              <div class="flex items-center justify-between gap-2 text-sm">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-3 h-3 rounded-full {['bg-red-400', 'bg-blue-400', 'bg-amber-400', 'bg-green-400'][Math.min(seatIdx, 3)]}"></span>
                  <span>Player {pid}</span>
                </div>
                <span class="font-mono font-bold">{score} pts</span>
              </div>
            {/if}
          {/each}
        </div>

        <!-- New Game button -->
        <button
          onclick={async () => {
            const { roomId: newRoomId } = await api.createRoom()
            goto(`/room/${newRoomId}`)
          }}
          class="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer">
          New Game
        </button>
      </div>
    </div>
  {/if}
{/if}
{/if}