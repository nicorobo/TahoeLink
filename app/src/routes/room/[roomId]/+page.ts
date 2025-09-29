import type { PageLoad } from "./$types"
import { browser } from '$app/environment'

const getDefaultGameState = () => {
    return Array.from({ length: 100 }, () => 0)
}

export const load: PageLoad = async ({ fetch, params }) => {
    const { roomId } = params
    try {
        // Use different URLs for browser vs SSR
        const apiUrl = `/api/room/${roomId}`
        console.log('Fetching from:', apiUrl, 'Browser:', browser)

        const response = await fetch(apiUrl)
        console.log('Response status:', response.status, response.statusText)

        if (!response.ok) {
            console.error('Response not ok:', response.status, response.statusText)
            return { gameState: getDefaultGameState() }
        }

        const data = await response.json()
        console.log('Fetched game state:', data)

        // Handle both { rooms: [...] } and direct array responses
        const gameState = data.gameState
        console.log('Game state:', gameState, browser)
        return { gameState }

    } catch (error) {
        console.error('Error fetching game state:', error)
        return { gameState: getDefaultGameState() }
    }
}