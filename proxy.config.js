module.exports = {
  "*": {
    "bypass": (req, res, proxyOption) => {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
  }
}
