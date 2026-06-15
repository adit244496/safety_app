from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user, require_admin, require_super_admin

router = APIRouter(prefix="/api/ease-score", tags=["ease-score"])

MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

CATEGORY_ORDER = [
    "General Safety",
    "Housekeeping",
    "Personal Protective Equipment and work apparels",
    "Work at Height",
    "Electrical",
    "Welding,  cutting and grinding",
    "Vehicles, Earth movers & Lifting Equipment",
    "Fire Prevention/ Protection",
    "First Aid & Medical Facilities",
    "Welfare Facilities and labour accomodation",
    "Environment Aspects",
    "Piling Work",
    "Excavation and confined space job",
    "Hand tools (manual and power driven)",
]


@router.get("/projects")
def get_ease_projects(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    projects = db.query(models.Project.name).order_by(models.Project.name).all()
    return [p[0] for p in projects]


@router.get("/")
def get_ease_scores(
    project_name: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.EaseScoreEntry)
    if project_name:
        q = q.filter(models.EaseScoreEntry.project_name.in_(project_name))

    # Filter by period using date_from/date_to mapped to year-month
    if date_from:
        parts = date_from.split("-")
        if len(parts) >= 2:
            y, m = int(parts[0]), int(parts[1])
            q = q.filter(
                (models.EaseScoreEntry.period_year > y) |
                ((models.EaseScoreEntry.period_year == y) & (models.EaseScoreEntry.period_month >= m))
            )
    if date_to:
        parts = date_to.split("-")
        if len(parts) >= 2:
            y, m = int(parts[0]), int(parts[1])
            q = q.filter(
                (models.EaseScoreEntry.period_year < y) |
                ((models.EaseScoreEntry.period_year == y) & (models.EaseScoreEntry.period_month <= m))
            )

    entries = q.order_by(
        models.EaseScoreEntry.period_year,
        models.EaseScoreEntry.period_month,
    ).all()

    # Group by project + period into evaluation records
    periods: dict = {}
    for e in entries:
        key = f"{e.project_name}_{e.period_year}_{e.period_month:02d}"
        if key not in periods:
            periods[key] = {
                "project_name": e.project_name,
                "period_year": e.period_year,
                "period_month": e.period_month,
                "period_label": f"{MONTH_NAMES[e.period_month]} {e.period_year}",
                "date_from": e.date_from,
                "date_to": e.date_to,
                "overall_score": round(e.overall_score * 100, 1) if e.overall_score is not None else None,
                "ease_category": e.ease_category,
                "categories": {},
            }
        periods[key]["categories"][e.category] = {
            "score": round(e.score * 100, 1) if e.score is not None else None,
            "gradation": e.gradation,
        }

    # Return ordered list with CATEGORY_ORDER applied
    result = []
    for period_data in periods.values():
        ordered_cats = []
        for cat in CATEGORY_ORDER:
            cat_data = period_data["categories"].get(cat, {"score": None, "gradation": "NA"})
            ordered_cats.append({"category": cat, **cat_data})
        period_data["categories"] = ordered_cats
        result.append(period_data)

    return result


# ─── Evaluation Criteria CRUD ────────────────────────────────────────────────

class TopicCreate(BaseModel):
    name: str
    sort_order: int = 0

class TopicUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None

class ElementCreate(BaseModel):
    topic_id: int
    question: str
    assessment_value: int = 3
    sort_order: int = 0

class ElementUpdate(BaseModel):
    question: Optional[str] = None
    assessment_value: Optional[int] = None
    sort_order: Optional[int] = None


@router.get("/criteria")
def get_criteria(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    topics = db.query(models.EaseTopic).order_by(models.EaseTopic.sort_order).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "sort_order": t.sort_order,
            "elements": [
                {
                    "id": e.id,
                    "question": e.question,
                    "assessment_value": e.assessment_value,
                    "sort_order": e.sort_order,
                }
                for e in t.elements
            ],
        }
        for t in topics
    ]


@router.post("/criteria/topics", dependencies=[Depends(require_admin)])
def create_topic(body: TopicCreate, db: Session = Depends(get_db)):
    if db.query(models.EaseTopic).filter_by(name=body.name).first():
        raise HTTPException(400, "Topic with this name already exists")
    t = models.EaseTopic(name=body.name, sort_order=body.sort_order)
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "name": t.name, "sort_order": t.sort_order, "elements": []}


@router.put("/criteria/topics/{topic_id}", dependencies=[Depends(require_admin)])
def update_topic(topic_id: int, body: TopicUpdate, db: Session = Depends(get_db)):
    t = db.query(models.EaseTopic).get(topic_id)
    if not t:
        raise HTTPException(404, "Topic not found")
    if body.name is not None:
        t.name = body.name
    if body.sort_order is not None:
        t.sort_order = body.sort_order
    db.commit()
    return {"id": t.id, "name": t.name, "sort_order": t.sort_order}


@router.delete("/criteria/topics/{topic_id}", dependencies=[Depends(require_super_admin)])
def delete_topic(topic_id: int, db: Session = Depends(get_db)):
    t = db.query(models.EaseTopic).get(topic_id)
    if not t:
        raise HTTPException(404, "Topic not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/criteria/elements", dependencies=[Depends(require_admin)])
def create_element(body: ElementCreate, db: Session = Depends(get_db)):
    if not db.query(models.EaseTopic).get(body.topic_id):
        raise HTTPException(404, "Topic not found")
    e = models.EaseEvaluationElement(
        topic_id=body.topic_id,
        question=body.question,
        assessment_value=body.assessment_value,
        sort_order=body.sort_order,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id, "topic_id": e.topic_id, "question": e.question,
            "assessment_value": e.assessment_value, "sort_order": e.sort_order}


@router.put("/criteria/elements/{element_id}", dependencies=[Depends(require_admin)])
def update_element(element_id: int, body: ElementUpdate, db: Session = Depends(get_db)):
    e = db.query(models.EaseEvaluationElement).get(element_id)
    if not e:
        raise HTTPException(404, "Element not found")
    if body.question is not None:
        e.question = body.question
    if body.assessment_value is not None:
        e.assessment_value = body.assessment_value
    if body.sort_order is not None:
        e.sort_order = body.sort_order
    db.commit()
    return {"id": e.id, "topic_id": e.topic_id, "question": e.question,
            "assessment_value": e.assessment_value, "sort_order": e.sort_order}


@router.delete("/criteria/elements/{element_id}", dependencies=[Depends(require_super_admin)])
def delete_element(element_id: int, db: Session = Depends(get_db)):
    e = db.query(models.EaseEvaluationElement).get(element_id)
    if not e:
        raise HTTPException(404, "Element not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


# ─── Element Responses (per project+period data entry) ──────────────────────

RESPONSE_MARKS = {
    "Yes": 1.0,
    "Tending Yes": 0.5,
    "Tending No": 0.25,
    "No": 0.0,
    "NA": None,  # excluded
}


def _gradation(score: float) -> str:
    if score >= 0.90:
        return "EXCELLENT"
    if score >= 0.75:
        return "GOOD"
    if score >= 0.60:
        return "AVERAGE"
    return "BELOW AVERAGE"


def _recalculate_scores(project_name: str, period_year: int, period_month: int, db: Session):
    """Recompute EaseScoreEntry rows from EaseElementResponse rows for a given project+period."""
    topics = db.query(models.EaseTopic).order_by(models.EaseTopic.sort_order).all()
    responses: dict[int, str] = {
        r.element_id: r.response
        for r in db.query(models.EaseElementResponse).filter_by(
            project_name=project_name, period_year=period_year, period_month=period_month
        ).all()
    }

    total_obtained = 0.0
    total_applicable = 0.0

    for topic in topics:
        obtained = 0.0
        applicable = 0.0
        for el in topic.elements:
            resp = responses.get(el.id)
            factor = RESPONSE_MARKS.get(resp) if resp else None
            if factor is None:
                continue  # NA or no response → excluded
            obtained += factor * el.assessment_value
            applicable += el.assessment_value

        cat_score = (obtained / applicable) if applicable > 0 else None
        cat_grad = _gradation(cat_score) if cat_score is not None else "NA"

        total_obtained += obtained
        total_applicable += applicable

        existing = db.query(models.EaseScoreEntry).filter_by(
            project_name=project_name, period_year=period_year,
            period_month=period_month, category=topic.name,
        ).first()
        if existing:
            existing.score = cat_score
            existing.gradation = cat_grad
        else:
            db.add(models.EaseScoreEntry(
                project_name=project_name, period_year=period_year,
                period_month=period_month, category=topic.name,
                score=cat_score, gradation=cat_grad,
            ))

    overall = (total_obtained / total_applicable) if total_applicable > 0 else None
    overall_grad = _gradation(overall) if overall is not None else "NA"

    for entry in db.query(models.EaseScoreEntry).filter_by(
        project_name=project_name, period_year=period_year, period_month=period_month
    ).all():
        entry.overall_score = overall
        entry.ease_category = overall_grad

    db.commit()


class ResponseItem(BaseModel):
    element_id: int
    response: Optional[str] = None  # 'Yes', 'Tending Yes', 'Tending No', 'No', 'NA'


class SaveResponsesBody(BaseModel):
    project_name: str
    period_year: int
    period_month: int
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    responses: list[ResponseItem]


@router.get("/responses")
def get_responses(
    project_name: str = Query(...),
    period_year: int = Query(...),
    period_month: int = Query(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    rows = db.query(models.EaseElementResponse).filter_by(
        project_name=project_name, period_year=period_year, period_month=period_month,
    ).all()
    return {r.element_id: r.response for r in rows}


@router.post("/responses")
def save_responses(
    body: SaveResponsesBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    existing = {
        r.element_id: r
        for r in db.query(models.EaseElementResponse).filter_by(
            project_name=body.project_name,
            period_year=body.period_year,
            period_month=body.period_month,
        ).all()
    }

    for item in body.responses:
        if item.element_id in existing:
            existing[item.element_id].response = item.response
        else:
            db.add(models.EaseElementResponse(
                project_name=body.project_name,
                period_year=body.period_year,
                period_month=body.period_month,
                element_id=item.element_id,
                response=item.response,
            ))

    if body.date_from or body.date_to:
        for entry in db.query(models.EaseScoreEntry).filter_by(
            project_name=body.project_name,
            period_year=body.period_year,
            period_month=body.period_month,
        ).all():
            if body.date_from:
                entry.date_from = body.date_from
            if body.date_to:
                entry.date_to = body.date_to

    db.commit()
    _recalculate_scores(body.project_name, body.period_year, body.period_month, db)
    return {"ok": True}
