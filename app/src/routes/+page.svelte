<script lang="ts">
  import { api } from '$lib/api'
  import { goto } from '$app/navigation'

  async function createRoom() {
    const response = await api.createRoom()
    const { roomId } = response
    goto(`/room/${roomId}`)
  }
</script>

<h1>Welcome to NickKit</h1>
<button onclick={createRoom}>Create Room</button>
