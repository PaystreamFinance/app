/* eslint-disable @next/next/no-img-element */
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import React from "react";

const NotFoundPage = () => {
  return (
    <div className="relative h-full min-h-screen w-full">
      <Image src="/404.svg" alt="404" fill className="object-cover" />

      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-52">
        <img
          className="w-[169px] select-none"
          src="/full-logo.svg"
          alt="full-logo.svg"
        />

        <Link href="/" className="relative">
          <Button className="font-ibm-plex-serif flex w-[266px] cursor-pointer items-center text-center text-lg font-normal text-[#001024] italic shadow-none">
            Back home
          </Button>
          <img
            className="absolute -top-4 left-0 -z-10 select-none"
            src="/404-ellipse.svg"
            alt="404 ellipse bg"
          />
        </Link>

        <p className="font-ibm-plex-serif flex items-center text-center text-lg font-medium text-white italic">
          We can&apos;t found the page that <br /> you&apos;re looking for :(
        </p>
      </div>
    </div>
  );
};

export default NotFoundPage;
