ALTER TABLE "PortfolioMedia"
  DROP CONSTRAINT "PortfolioMedia_size_check",
  ADD CONSTRAINT "PortfolioMedia_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 20000000);
