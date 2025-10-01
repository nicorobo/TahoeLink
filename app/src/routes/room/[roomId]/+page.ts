import type { PageLoad } from "./$types"
import { browser } from '$app/environment'

const getDefaultBoard = () => {
    return Array(10).fill(Array(10).fill(-1))
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
            return { board: getDefaultBoard() }
        }

        const data = await response.json()
        console.log('Fetched game state:', data)

        // Handle both { rooms: [...] } and direct array responses
        const board = data.board
        console.log('Game state:', board, browser)
        return { board }

    } catch (error) {
        console.error('Error fetching game state:', error)
        return { board: getDefaultBoard() }
    }
}