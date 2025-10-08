<script lang="ts">
  import { api } from '$lib/api'
  import { page } from '$app/state'
  import { onMount, onDestroy } from 'svelte'
  import Board from '$lib/components/Board.svelte'
  import { pieceState } from '$lib/state.svelte'
  import type { PageProps } from './$types'
  import PieceControl from '$lib/components/PieceControl.svelte'
  import PieceDisplay from '$lib/components/PieceDisplay.svelte'
  import PlayerStatus from '$lib/components/PlayerStatus.svelte'
  import { eventHandlers } from '$lib/events'

  let roomId = $derived(page.params.roomId)
  let { data }: PageProps = $props()
  let board = $state(data.board)

  const makeMove = async (cell: number) => {
    const column = cell % 10
    const response = await api.makeMove({
      roomId: roomId ?? '',
      column,
      shape: pieceState.shape,
      rotation: pieceState.rotation,
      flip: pieceState.flip,
    })
    board = response.board
  }

  const onJoin = async (color: number) => {
    await api.joinRoom({
      roomId: roomId ?? '',
      color,
    })
  }

  onMount(() => {
    if (!roomId) return

    const eventSource = new EventSource(`/api/sse/room/${roomId}`)

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

<h1>Room: {roomId}</h1>
<p>Welcome to room {roomId}</p>
<PlayerStatus {onJoin} />

<PieceControl />
<PieceDisplay />
<Board {board} onClick={makeMove} />
