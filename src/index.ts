"use strict";
import { readdirSync } from "fs";
import * as id3 from "node-id3";
import readline from "readline";
import axios from "axios";
import * as z from "zod";

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

(async () => {
  // read only .mp3 files
  const files = readdirSync("./music").filter((file) => file.endsWith(".mp3"));

  if (files.length === 0) {
    console.log("No files found!");
    process.exit(0);
  }

  let musicData: {
    title: string;
    artist: string;
  }[];

  try {
    musicData = files.map((file) => {
      const [part1, part2] = file.split(" - ");
      const [artistName, _] = part2.split(".");

      return {
        title: part1.trim(),
        artist: artistName.trim(),
      };
    });
  } catch (error) {
    console.error("Invalid file name format!");
    process.exit(1);
  }

  const parseMusic = async () => {
    let count = 0;

    for (const { title, artist } of musicData) {
      await new Promise((resolve) => {
        ++count;
        console.log(`${count} --> Processing ${title} - ${artist}...`);

        axios
          .get(
            `https://itunes.apple.com/search?term=${title.replace(
              /[\.\,\(\)\[\]]/g,
              ""
            )}+${artist}&entity=song`
          )
          .then(async (response) => {
            if (ItunesApiSchema.safeParse(response.data).success) {
              const { results } = ItunesApiSchema.parse(response.data);

              let [result] = results.filter(
                ({ trackName, artistName }) =>
                  trackName
                    ?.toLowerCase()
                    .replace(/[\.\,\(\)\[\]\'\"]/g, "") ===
                    title?.toLowerCase().replace(/[\.\,\(\)\[\]\'\"]/g, "") &&
                  artistName?.toLowerCase() === artist?.toLowerCase()
              );

              // console.table({
              //   title: result?.trackName,
              //   artist: result?.artistName,
              //   album: result?.collectionName,
              //   year: result?.releaseDate?.split("-")[0],
              //   genre: result?.primaryGenreName,
              //   trackNumber: result?.trackNumber,
              // });

              if (!result) {
                console.log(
                  "Unable to automatically find data!\nCan you select the correct data from the list below?"
                );
                console.table(
                  results.slice(0, 5).map((result) => ({
                    title: result?.trackName,
                    artist: result?.artistName,
                  }))
                );

                const rl = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout,
                });

                result = await new Promise((resolve) => {
                  rl.question(
                    "Enter the index of the correct data: ",
                    (index) => {
                      rl.close();
                      console.log(`You entered: ${index}`);
                      resolve(
                        results.filter((_, i) => i === parseInt(index))[0]
                      );
                    }
                  );
                });
              }

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

              console.log(tags);

              id3.write(tags, "./music/" + title + " - " + artist + ".mp3");
            } else {
              // reject("Invalid response from iTunes API");
            }
          })
          .finally(() => resolve(true));
      });
    }
  };

  await parseMusic();

  console.log(`Processed files!`);
})();
