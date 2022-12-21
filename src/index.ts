"use strict";
import { readdirSync } from "fs";
import * as id3 from "node-id3";
import axios from "axios";
import * as z from "zod";

(async () => {
  const ItunesApiSchema = z.object({
    resultCount: z.number(),
    results: z.array(
      z.object({
        trackName: z.string(),
        artistName: z.string(),
        collectionName: z.string(),
        artworkUrl100: z.string(),
        releaseDate: z.string(),
        trackNumber: z.number(),
        primaryGenreName: z.string(),
      })
    ),
  });

  const files = readdirSync("./music");

  if (files.length === 0) {
    console.log("No files found!");
    process.exit(0);
  }

  const musicData = files.map((file) => {
    const [part1, part2] = file.split("-");
    const [artistName, _] = part2.split(".");

    return {
      title: part1.trim(),
      artist: artistName.trim(),
    };
  });

  const getData = async () => {
    let count = 0;

    for (const { title, artist } of musicData) {
      await new Promise((resolve, reject) => {
        console.log(`Processing ${title} - ${artist} ${count}...`);

        axios
          .get(
            `https://itunes.apple.com/search?term=${artist}+${title}&entity=song`
          )
          .then((response) => {
            if (ItunesApiSchema.safeParse(response.data).success) {
              const { results } = ItunesApiSchema.parse(response.data);

              const [result] = results.filter(
                ({ trackName, artistName }) =>
                  trackName?.toLowerCase() === title?.toLowerCase() &&
                  artistName?.toLowerCase() === artist?.toLowerCase()
              );

              console.table({
                title: result?.trackName,
                artist: result?.artistName,
                album: result?.collectionName,
                year: result?.releaseDate?.split("-")[0],
                genre: result?.primaryGenreName,
                trackNumber: result?.trackNumber,
              });

              const tags = id3.read(
                "./music/" + title + " - " + artist + ".mp3"
              );

              tags.title = result.trackName;
              tags.artist = result.artistName;
              tags.album = result.collectionName;
              tags.year = result.releaseDate?.split("-")[0];
              tags.genre = result.primaryGenreName;
              tags.trackNumber = result.trackNumber?.toString();
              tags.image = result.artworkUrl100;

              id3.write(tags, "./music/" + title + " - " + artist + ".mp3");
            } else {
              reject("Invalid response from iTunes API");
            }
          })
          .catch((error) => {
            console.error(error);
            reject(error);
          })
          .finally(() => {
            resolve(true);
          });
      }).then(() => {
        count++;
      });
    }

    return count;
  };

  const count = await getData();

  console.log(`Successfully processed ${count}/${musicData.length} files!`);
})();
