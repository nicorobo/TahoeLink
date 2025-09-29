<script lang="ts">
  import type { PageProps } from './$types'
  import { api } from '$lib/api'
  import { goto } from '$app/navigation'

  async function createRoom() {
    const response = await api.createRoom()
    const { roomId } = response
    goto(`/room/${roomId}`)
  }
</script>

<h1>Welcome to TahoeLink</h1>
<button
  class="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 cursor-pointer"
  onclick={createRoom}>Create Room</button>
