<script lang="ts">
  import { api, API_BASE } from '$lib/api'
  import { page } from '$app/state'
  import { onMount, onDestroy } from 'svelte'
  import { pieceState, playerState, roomState } from '$lib/state.svelte'
  import { eventHandlers } from '$lib/events'
  import PlayerSelectionScreen from '$lib/components/PlayerSelectionScreen.svelte'
  let roomId = $derived(page.params.roomId)
  const { data } = $props()

  $effect(() => {
    roomState.roll = data.room.roll
    roomState.turn = data.room.turn
    roomState.board = data.room.board
    roomState.stage = data.room.stage
    roomState.activePlayer = data.room.activePlayer
    playerState.playerId = data.playerId
    playerState.playerIds = data.playerIds
  })

  const makeMove = async (cell: number) => {
    const column = cell % 10
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

  // const onStart = async () => {
  //   const res = await api.startGame({ roomId })
  //   roomState.roll = res.roll
  //   roomState.turn = res.turn
  //   roomState.board = res.board
  //   roomState.stage = res.stage
  // }

  const onJoin = async (requestedPlayerId: number) => {
    const res = await api.joinRoom({
      roomId: roomId ?? '',
      playerId: requestedPlayerId,
    })
    playerState.playerId = res.playerId
    playerState.playerIds = res.playerIds
  }

  const onLeave = async () => {
    const res = await api.leaveRoom({
      roomId: roomId ?? '',
    })
    playerState.playerId = null
    playerState.playerIds = res.playerIds
  }

  onMount(() => {
    if (!roomId) return

    const eventSource = new EventSource(`${API_BASE}/sse/room/${roomId}`)

    for (const [eventType, handler] of Object.entries(eventHandlers)) {
      eventSource.addEventListener(eventType, (event) => {
        const data = JSON.parse(event.data)
        handler(data)
      })
    }

    eventSource.onerror = (e) => console.error('SSE error:', e)
    eventSource.onopen = () => console.log('SSE connection opened')

    onDestroy(() => eventSource.close())
  })
</script>

{#if roomState.stage === 'waiting-for-players'}
  <PlayerSelectionScreen />
{:else}
  <div>Game Screen</div>
{/if}
