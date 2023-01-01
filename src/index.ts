"use strict";
import { readdirSync } from "fs";
import * as id3 from "node-id3";
import readline from "readline";
import axios from "axios";
import * as z from "zod";

const TrackSchema = z.object({
  trackName: z.string().nullish(),
  artistName: z.string().nullish(),
  collectionName: z.string().nullish(),
  artworkUrl100: z.string().nullish(),
  releaseDate: z.string().nullish(),
  trackNumber: z.number().nullish(),
  primaryGenreName: z.string().nullish(),
});

const ItunesApiSchema = z.object({
  resultCount: z.number(),
  results: z.array(TrackSchema),
});

(async () => {
  // read only .mp3 files
  const rootPath = process.argv[2] ?? "./music";
  const files = readdirSync(rootPath).filter((file) => file.endsWith(".mp3"));

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
      await new Promise((resolve, reject) => {
        ++count;
        console.log(`${count} --> Processing ${title} - ${artist}...`);

        const tags = id3.read(rootPath + "/" + title + " - " + artist + ".mp3");

        if (tags.title && tags.artist) {
          console.log("Tags already exist!");
          return resolve(true);
        }

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
              if (!result) {
                console.log(
                  "Unable to automatically find data!\nCan you select the correct data from the list below?"
                );

                results
                  .slice(0, 5)
                  .map((result, index) =>
                    console.log(
                      `${index} - ${result.trackName} by ${result.artistName}`
                    )
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

              if (TrackSchema.safeParse(result).success) {
                const tags = id3.read(
                  rootPath + "/" + title + " - " + artist + ".mp3"
                );

                tags.title = result.trackName ?? undefined;
                tags.artist = result.artistName ?? undefined;
                tags.album = result.collectionName ?? undefined;
                tags.year = result.releaseDate?.split("-")[0];
                tags.genre = result.primaryGenreName ?? undefined;
                tags.trackNumber = result.trackNumber?.toString();
                tags.image = result.artworkUrl100 ?? undefined;

                id3.write(tags, rootPath + title + " - " + artist + ".mp3");
              }
            } else {
              reject("Invalid response from iTunes API!");
            }
          })
          .finally(() => resolve(true));
      });
    }
  };

  try {
    await parseMusic();
    console.log("Process complete!");
  } catch (error) {
    console.error(error);
  }
})();
