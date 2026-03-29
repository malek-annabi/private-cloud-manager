import { BrowserRouter, Routes, Route } from "react-router-dom";
import VMs from "./pages/VMs";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Layout from "./components/layout/Layout";
export default function App() {
  return (
    <BrowserRouter>
     <Layout>
      <Routes>
        <Route path="/" element={<VMs />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
      </Routes>
    </Layout>
    </BrowserRouter>
  );
}