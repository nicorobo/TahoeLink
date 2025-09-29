<script lang="ts">
  import { api } from '$lib/api'
  import { page } from '$app/state'
  import { onMount, onDestroy } from 'svelte'
  import Board from '$lib/components/Board.svelte'
  import type { PageProps } from './$types'

  let roomId = $derived(page.params.roomId)
  let { data }: PageProps = $props()
  let gameState = $state(data.gameState)
  let eventSource: EventSource | null = null

  const makeMove = async (move: number) => {
    const response = await api.makeMove(roomId ?? '', move)
    gameState = response.gameState
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
          gameState = data.gameState
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

<Board {gameState} onClick={makeMove} />
