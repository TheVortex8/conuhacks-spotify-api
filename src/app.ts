// src/app.ts
import express, { Request, Response } from 'express';
import SpotifyWebApi from 'spotify-web-api-node';
import fs from 'fs';
import token from '../token.json'
import cors from 'cors';
require('dotenv').config();

const app = express();
app.use(cors())
const PORT = 3000;
const tokenFilePath = 'C:/Users/amine/Documents/Projects/conuhacks-spotimood/spotify-api/token.json';

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  redirectUri: 'http://172.30.177.254:3000/callback',
});

app.use(express.json());
app.use((req, res, next) => {
  const now = new Date();
  const timestamp = now.toISOString();
  console.log(`NEW REQUEST: [${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
})

interface Playlist {
  songs: string[];
  name: string;
}

app.get('/clear', async (req, res) => {
  try {
    // Step 1: Retrieve User Playlists
    await setAuth();
    const playlistsResponse = await spotifyApi.getUserPlaylists();
    const playlists = playlistsResponse.body.items;

    // Step 2: Delete Each Playlist
    for (const playlist of playlists) {
      const tracksResponse = await spotifyApi.getPlaylistTracks(playlist.id);
      const tracks = tracksResponse.body.items.map((track) => ({ uri: track.track.uri }));

      await spotifyApi.removeTracksFromPlaylist(playlist.id, tracks);
      await spotifyApi.unfollowPlaylist(playlist.id);
    }

    const message = `${playlists.length} playlists deleted successfully.`
    console.log(message);
    res.json({ message });
  } catch (error) {
    console.error('Error deleting playlists:', error.message);
    res.send(`Error deleting playlist: ${JSON.stringify(error)}`);
  }
})

app.post('/generatePlaylist', async (req, res) => {
  try {
    await setAuth();

    let songsRequests: string[], playlistName: string;

    if (Object.keys(req.body).length !== 0) {
      songsRequests = req.body.songs as string[];
      playlistName = req.body.name as string;
    }

    const playlist: Playlist = {
      songs: songsRequests,
      name: playlistName
    };

    if (!songsRequests || !songsRequests.length || !playlistName) {
      console.log("Missing body")
      return res.status(400).json({ error: 'Please provide an array of objects with "songName" and "artist" properties in the body' });
    }

    const tracksPromises = playlist.songs.map(async (song) => {
      const searchResponse = await spotifyApi.searchTracks(song, { limit: 1 });

      const track = searchResponse.body.tracks?.items[0];
      return {
        spotifyId: track?.id,
      };
    });

    const tracks = await Promise.all(tracksPromises);

    // Extract only tracks with valid Spotify IDs
    const validTracks = tracks.filter((track) => track.spotifyId);

    // Create a playlist
    const createPlaylistResponse = await spotifyApi.createPlaylist(playlist.name, {
      public: true,
    });

    const playlistId = createPlaylistResponse.body.id;

    // Add tracks to the playlist
    await spotifyApi.addTracksToPlaylist(playlistId, validTracks.map((track) => `spotify:track:${track.spotifyId}`));

    // Get the playlist URL
    const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
    console.log("Playlist sucessfully generated:", playlistUrl)

    res.json({ playlistUrl });
  } catch (error) {
    console.error('Error:', JSON.stringify(error));
    res.send(`Error: ${JSON.stringify(error)}`);
  };
});

app.listen(PORT, "172.30.177.254", () => {
  console.log(`Server is running on http://172.30.177.254:${PORT}`);
});
async function setAuth() {
  spotifyApi.setAccessToken(token.access_token);
  spotifyApi.setRefreshToken(token.refresh_token);

  try {
    // Testing if access token works
    await spotifyApi.getMe();
  } catch (err) {
    const { body } = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(body.access_token);
    spotifyApi.setRefreshToken(body.refresh_token);
    const tokenObject = {
      ...body,
      refresh_token: token.refresh_token
    };
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenObject, null, 2), { encoding: 'utf-8', flag: 'w' });
    console.log("Token refreshed!")
  }
}

