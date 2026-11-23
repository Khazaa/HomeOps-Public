import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./e2e',timeout:90_000,fullyParallel:false,reporter:[['list']],use:{baseURL:process.env.HOMEOPS_TEST_URL??'http://localhost:3000',channel:'msedge',headless:true,screenshot:'only-on-failure',trace:'retain-on-failure'}});
