<script lang="ts">
  import { api } from '$lib/api'
  import { page } from '$app/state'
  import { onMount, onDestroy } from 'svelte'
  import Board from '$lib/components/Board.svelte'
  import { pieceState } from '$lib/state.svelte'
  import type { PageProps } from './$types'
  import PieceControl from '$lib/components/PieceControl.svelte'
  import PieceDisplay from '$lib/components/PieceDisplay.svelte'

  let roomId = $derived(page.params.roomId)
  let { data }: PageProps = $props()
  let board = $state(data.board)
  let eventSource: EventSource | null = null

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

  onMount(() => {
    if (roomId) {
      const connectSSE = () => {
        eventSource = new EventSource(`/api/sse/room/${roomId}`)

        eventSource.addEventListener('connected', (event) => {
          console.log('Connected to room:', event.data)
          const data = JSON.parse(event.data)
          console.log('Connected data:', data)
        })

        eventSource.addEventListener('new-connection', (event) => {
          const data = JSON.parse(event.data)
          console.log(data.message)
        })

        eventSource.addEventListener('turn', (event) => {
          const data = JSON.parse(event.data)
          board = data.board
        })

        eventSource.addEventListener('error', (event) => {
          console.error('SSE error:', event)
          // Don't auto-reconnect on error - let the browser handle it
        })

        eventSource.onopen = () => {
          console.log('SSE connection opened')
        }

        eventSource.onerror = (event) => {
          console.error('SSE connection error:', event)
        }
      }

      connectSSE()
    }
  })

  onDestroy(() => {
    console.log('onDestroy', roomId)
    if (eventSource) {
      eventSource.close()
    }
  })
</script>

<h1>Room: {roomId}</h1>
<p>Welcome to room {roomId}</p>

<PieceControl />
<PieceDisplay />
<Board {board} onClick={makeMove} />
