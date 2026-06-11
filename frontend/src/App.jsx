import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Verify from "./pages/Verify";
import Home from "./pages/Home";
import ClubPage from "./pages/ClubPage";
import PostPage from "./pages/PostPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/" element={<Home />} />
        <Route path="/club/:id" element={<ClubPage />} />
        <Route path="/post/:id" element={<PostPage />} />
      </Routes>
    </BrowserRouter>
  );
}
