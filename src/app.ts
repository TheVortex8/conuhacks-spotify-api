// src/app.ts
import express, { Request, Response } from 'express';
import SpotifyWebApi from 'spotify-web-api-node';

require('dotenv').config();

const scopes = [
  'ugc-image-upload',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'app-remote-control',
  'user-read-email',
  'user-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-read-private',
  'playlist-modify-private',
  'user-library-modify',
  'user-library-read',
  'user-top-read',
  'user-read-playback-position',
  'user-read-recently-played',
  'user-follow-read',
  'user-follow-modify'
];
const app = express();
const PORT = process.env.PORT || 3000;

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  redirectUri: 'http://localhost:3000/callback',
});

app.use(express.json());

interface Playlist {
  songs: string[];
  name: string;
}
app.get('/generatePlaylist', (req, res) => {
  let songsRequests, playlistName;
  if(Object.keys(req.body).length !== 0) {
    songsRequests = req.body.songs as string[];
    playlistName = req.body.name as string;
  } else {
    songsRequests = (req.query.songs as string).split(",");
    playlistName = req.query.name as string;
  }

  const playlist = {
    songs: songsRequests,
    name: playlistName
  };

  if (!songsRequests || !songsRequests.length || !playlistName) {
    return res.status(400).json({ error: 'Please provide an array of objects with "songName" and "artist" properties in the body' });
  }

  res.redirect(spotifyApi.createAuthorizeURL(scopes, JSON.stringify(playlist)));
});

app.get('/callback', async (req, res) => {
  try {
    const error = req.query.error;
    const code = req.query.code as string;
    const playlist: Playlist = JSON.parse(req.query.state as string);

    if (error) {
      console.error('Callback Error:', error);
      res.send(`Callback Error: ${error}`);
      return;
    }

    const data = await spotifyApi.authorizationCodeGrant(code);
    const access_token = data.body['access_token'];
    const refresh_token = data.body['refresh_token'];
    const expires_in = data.body['expires_in'];

    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);

    console.log('access_token:', access_token);
    console.log('refresh_token:', refresh_token);

    console.log(
      `Sucessfully retreived access token. Expires in ${expires_in} s.`
    );
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
      public: false,
    });

    const playlistId = createPlaylistResponse.body.id;

    // Add tracks to the playlist
    const addTracksResponse = await spotifyApi.addTracksToPlaylist(playlistId, validTracks.map((track) => `spotify:track:${track.spotifyId}`));

    // Get the playlist URL
    const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;

    res.json({ playlistId, playlistUrl, addedTracks: addTracksResponse.body.snapshot_id });
  } catch (error) {
    console.error('Error getting Tokens:', error);
    res.send(`Error getting Tokens: ${error}`);
  };
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
